#!/bin/bash
cd /opt/DiscordBot || exit 1

for dir in */; do
    bot_name="${dir%/}"
    if [ -f "$dir/main.py" ]; then
        tmux new-session -A -d -s "$bot_name" \
            "bash -c 'export DISCORD_BOT_${bot_name^^}=$bot_name; cd /opt/DiscordBot/$bot_name && python3 main.py; echo \"Exited with code \$?\"; read'"
        echo "Started or attached tmux session: $bot_name"
    else
        echo "No main.py in $dir, skipping..."
    fi
done
