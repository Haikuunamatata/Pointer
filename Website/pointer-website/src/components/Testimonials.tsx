'use client';

import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const testimonials = [
    {
      content: "Pointer has completely changed how I code. The ability to run everything locally without sending my code to a cloud service is a game-changer for privacy.",
      author: "Alex Johnson",
      role: "Senior Developer",
      image: "https://randomuser.me/api/portraits/men/32.jpg",
    },
    {
      content: "The speed is unbelievable. No more waiting for remote APIs to respond - I get suggestions instantly as I type, and it feels like an extension of my thought process.",
      author: "TheGalitube",
      role: "Full Stack Vibe Coder",
      image: "/images/testimonials/thegalitube.png",
    },
    {
      content: "Working on client projects with sensitive data, I needed an AI assistant that respects privacy. Pointer is exactly what I've been looking for.",
      author: "HaÏkuu",
      role: "Content Creator",
      image: "/images/testimonials/haikuu.png",
    },
  ];

  return (
    <section 
      ref={ref}
      className="relative py-24 overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            What Beta Users Are Saying
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Developers around the world are using Pointer to enhance their coding productivity
            while maintaining complete control over their data.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.2 }}
              className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex items-center mb-6">
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-primary/30 mr-4">
                  <img 
                    src={testimonial.image} 
                    alt={testimonial.author}
                    className="w-full h-full object-cover"
                    width={48}
                    height={48}
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{testimonial.author}</h3>
                  <p className="text-sm text-gray-400">{testimonial.role}</p>
                </div>
              </div>
              <p className="text-gray-300 italic">"{testimonial.content}"</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
} 