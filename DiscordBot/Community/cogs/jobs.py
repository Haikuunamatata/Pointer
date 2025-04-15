import discord
from discord.ext import commands, tasks
from discord import app_commands
import asyncio
import time
from datetime import datetime
from typing import Optional, Dict, List, Any

from utils.db import Database
from utils.helpers import create_embed, send_dm, get_coin_emoji, format_time_until


class Jobs(commands.Cog):
    """Jobs commands for passive income"""

    def __init__(self, bot):
        self.bot = bot
        self.check_jobs.start()
    
    def cog_unload(self):
        """Clean up when cog is unloaded"""
        self.check_jobs.cancel()
    
    @tasks.loop(minutes=5)
    async def check_jobs(self):
        """Check jobs for payment every 5 minutes"""
        # Get all jobs and user jobs
        jobs_data = Database.load_data("data/jobs.json")
        
        # Get current time
        current_time = time.time()
        
        # Check each user job
        for user_id, job_data in jobs_data.get("user_jobs", {}).items():
            job_id = job_data.get("job_id")
            last_paid_time = job_data.get("last_paid_time", 0)
            
            # Find job info
            job_info = None
            for job in jobs_data.get("jobs", []):
                if job["id"] == job_id:
                    job_info = job
                    break
            
            # Skip if job not found
            if not job_info:
                continue
            
            # Check if payment interval has passed
            pay_interval_seconds = job_info["pay_interval"] * 60  # Convert minutes to seconds
            time_since_last_payment = current_time - last_paid_time
            
            if time_since_last_payment >= pay_interval_seconds:
                # Calculate number of payments to process
                num_payments = int(time_since_last_payment / pay_interval_seconds)
                
                # Limit to a maximum of 10 payments at once (to prevent huge payouts after bot downtime)
                num_payments = min(num_payments, 10)
                
                # Calculate total payout
                pay_amount = num_payments * job_info["pay_rate"]
                
                # Update user balance
                Database.update_user_balance(user_id, pay_amount, "add")
                
                # Update last paid time (only counting the payments we processed)
                new_last_paid_time = last_paid_time + (num_payments * pay_interval_seconds)
                Database.update_user_job_payment(user_id, new_last_paid_time)
                
                # Try to send a DM to the user
                try:
                    user = await self.bot.fetch_user(int(user_id))
                    if user:
                        coin_emoji = get_coin_emoji()
                        
                        embed = create_embed(
                            title="💰 Job Payment Received",
                            description=(
                                f"You received {pay_amount} {coin_emoji} from your job as a **{job_info['name']}**.\n\n"
                                f"Next payment: <t:{int(new_last_paid_time + pay_interval_seconds)}:R>"
                            ),
                            color=discord.Color.green()
                        )
                        
                        await send_dm(user, embed=embed)
                except Exception as e:
                    # Just continue if DM fails, not critical
                    pass
    
    @check_jobs.before_loop
    async def before_check_jobs(self):
        """Wait until bot is ready before starting loop"""
        await self.bot.wait_until_ready()
    
    @app_commands.command(name="job", description="Job commands")
    @app_commands.describe(
        action="The job action to perform",
        job="The job to apply for"
    )
    @app_commands.choices(action=[
        app_commands.Choice(name="list", value="list"),
        app_commands.Choice(name="apply", value="apply"),
        app_commands.Choice(name="resign", value="resign"),
        app_commands.Choice(name="stats", value="stats")
    ])
    async def job(
        self, 
        interaction: discord.Interaction, 
        action: str,
        job: Optional[str] = None
    ):
        """Job command group"""
        if action == "list":
            await self.list_jobs(interaction)
        elif action == "apply":
            await self.apply_for_job(interaction, job)
        elif action == "resign":
            await self.resign_from_job(interaction)
        elif action == "stats":
            await self.job_stats(interaction)
    
    async def list_jobs(self, interaction: discord.Interaction):
        """List available jobs"""
        # Get available jobs
        jobs = Database.get_all_jobs()
        
        if not jobs:
            await interaction.response.send_message("No jobs are available at this time.", ephemeral=True)
            return
        
        # Get coin emoji
        coin_emoji = get_coin_emoji()
        
        # Create embed
        embed = create_embed(
            title="📋 Available Jobs",
            description="Choose a job to earn passive income!",
            color=discord.Color.blue()
        )
        
        # Add each job as a field
        for job in jobs:
            embed.add_field(
                name=job["name"],
                value=(
                    f"**Pay:** {job['pay_rate']} {coin_emoji} every {job['pay_interval']} minutes\n"
                    f"**Description:** {job['description']}\n"
                    f"**To Apply:** `/job apply {job['id']}`"
                ),
                inline=False
            )
        
        # Send response
        await interaction.response.send_message(embed=embed)
    
    async def apply_for_job(self, interaction: discord.Interaction, job_id: str):
        """Apply for a job"""
        # Check if job ID is provided
        if not job_id:
            await interaction.response.send_message("Please specify a job ID to apply for. Use `/job list` to see available jobs.", ephemeral=True)
            return
        
        user_id = interaction.user.id
        
        # Check if user already has a job
        current_job = Database.get_user_job(user_id)
        if current_job:
            await interaction.response.send_message("You already have a job. Resign from your current job first with `/job resign`.", ephemeral=True)
            return
        
        # Check if job exists
        jobs = Database.get_all_jobs()
        job_info = None
        
        for job in jobs:
            if job["id"] == job_id:
                job_info = job
                break
        
        if not job_info:
            await interaction.response.send_message(f"Job with ID '{job_id}' not found. Use `/job list` to see available jobs.", ephemeral=True)
            return
        
        # Apply for the job
        current_time = time.time()
        success = Database.set_user_job(user_id, job_id, current_time)
        
        if success:
            # Get coin emoji
            coin_emoji = get_coin_emoji()
            
            # Create embed
            embed = create_embed(
                title="🎉 Job Application Successful",
                description=(
                    f"You are now employed as a **{job_info['name']}**!\n\n"
                    f"You will earn {job_info['pay_rate']} {coin_emoji} every {job_info['pay_interval']} minutes.\n"
                    f"First payment: <t:{int(current_time + job_info['pay_interval'] * 60)}:R>"
                ),
                color=discord.Color.green()
            )
            
            await interaction.response.send_message(embed=embed)
        else:
            await interaction.response.send_message("There was an error applying for the job. Please try again later.", ephemeral=True)
    
    async def resign_from_job(self, interaction: discord.Interaction):
        """Resign from current job"""
        user_id = interaction.user.id
        
        # Check if user has a job
        current_job = Database.get_user_job(user_id)
        if not current_job:
            await interaction.response.send_message("You don't have a job to resign from.", ephemeral=True)
            return
        
        # Get job info
        job_id = current_job.get("job_id")
        job_info = None
        
        for job in Database.get_all_jobs():
            if job["id"] == job_id:
                job_info = job
                break
        
        # Resign from job
        success = Database.remove_user_job(user_id)
        
        if success:
            job_name = job_info["name"] if job_info else "Unknown Job"
            
            embed = create_embed(
                title="Job Resignation",
                description=f"You have resigned from your job as a **{job_name}**.",
                color=discord.Color.orange()
            )
            
            await interaction.response.send_message(embed=embed)
        else:
            await interaction.response.send_message("There was an error resigning from your job. Please try again later.", ephemeral=True)
    
    async def job_stats(self, interaction: discord.Interaction):
        """Show job statistics"""
        user_id = interaction.user.id
        
        # Check if user has a job
        current_job = Database.get_user_job(user_id)
        if not current_job:
            await interaction.response.send_message("You don't have a job. Apply for one with `/job apply`.", ephemeral=True)
            return
        
        # Get job info
        job_id = current_job.get("job_id")
        start_time = current_job.get("start_time")
        last_paid_time = current_job.get("last_paid_time")
        
        job_info = None
        for job in Database.get_all_jobs():
            if job["id"] == job_id:
                job_info = job
                break
        
        if not job_info:
            await interaction.response.send_message("Job information not found. Please try again later.", ephemeral=True)
            return
        
        # Calculate statistics
        current_time = time.time()
        time_employed = current_time - start_time
        days_employed = int(time_employed / 86400)  # Convert to days
        
        # Calculate time until next payment
        pay_interval_seconds = job_info["pay_interval"] * 60  # Convert minutes to seconds
        next_payment_time = last_paid_time + pay_interval_seconds
        time_until_next = max(0, next_payment_time - current_time)
        
        # Calculate total earnings
        # This is an estimate based on how long they've been employed
        total_payments = time_employed / pay_interval_seconds
        total_earnings = int(total_payments * job_info["pay_rate"])
        
        # Get coin emoji
        coin_emoji = get_coin_emoji()
        
        # Create embed
        embed = create_embed(
            title=f"Job Stats - {job_info['name']}",
            color=discord.Color.blue()
        )
        
        # Add fields
        embed.add_field(
            name="Employment Duration",
            value=f"{days_employed} days" if days_employed > 0 else "Less than a day",
            inline=True
        )
        
        embed.add_field(
            name="Pay Rate",
            value=f"{job_info['pay_rate']} {coin_emoji} every {job_info['pay_interval']} minutes",
            inline=True
        )
        
        embed.add_field(
            name="Next Payment",
            value=f"<t:{int(next_payment_time)}:R>",
            inline=False
        )
        
        embed.add_field(
            name="Estimated Total Earnings",
            value=f"{total_earnings} {coin_emoji}",
            inline=True
        )
        
        # Send response
        await interaction.response.send_message(embed=embed)


async def setup(bot):
    await bot.add_cog(Jobs(bot)) 