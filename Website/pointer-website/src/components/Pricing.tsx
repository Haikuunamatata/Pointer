'use client';

import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

export default function Pricing() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const plans = [
    {
      name: "Community",
      price: "Free",
      description: "Open source version for individual developers",
      features: [
        "Local LLM integration",
        "Basic code completion",
        "Self-hosted option",
        "Community support",
        "GitHub integration",
      ],
      cta: "Download",
      popular: false,
    },
    {
      name: "Professional",
      price: "$15",
      description: "For professional developers and small teams",
      features: [
        "Everything in Community",
        "Advanced code generation",
        "Custom LLM configuration",
        "Priority support",
        "Multiple editor support",
        "Regular updates",
      ],
      cta: "Coming Soon",
      popular: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "For organizations with advanced needs",
      features: [
        "Everything in Professional",
        "Team collaboration features",
        "Enhanced security controls",
        "Custom integrations",
        "Dedicated support",
        "On-premise deployment",
      ],
      cta: "Contact Us",
      popular: false,
    },
  ];

  return (
    <section 
      id="pricing"
      ref={ref}
      className="relative py-24 overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-tertiary/5 to-transparent" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Choose Your Plan
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Select the plan that best fits your needs, from our free open-source
            offering to our professional and enterprise solutions.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.2 }}
              className={`relative bg-white/5 backdrop-blur-md rounded-xl p-8 border ${
                plan.popular 
                  ? "border-primary/30 shadow-lg shadow-primary/10" 
                  : "border-white/10 hover:border-white/20"
              } transition-all duration-300`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-primary text-white text-sm font-semibold py-1 px-4 rounded-full">
                  Most Popular
                </div>
              )}
              
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.price !== "Free" && plan.price !== "Custom" && (
                  <span className="text-gray-400 ml-1">/month</span>
                )}
              </div>
              <p className="text-gray-300 mb-6">{plan.description}</p>
              
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="ml-2 text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <button
                className={`w-full py-3 px-4 rounded-lg ${
                  plan.popular
                    ? "bg-primary text-white"
                    : "bg-white/10 text-white hover:bg-white/20"
                } font-semibold transition-all duration-300`}
                onClick={() => alert('This feature is coming soon!')}
              >
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
} 