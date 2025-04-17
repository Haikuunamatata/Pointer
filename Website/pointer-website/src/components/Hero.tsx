'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export default function Hero() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-start text-center overflow-hidden pt-[110px]">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-tertiary/10 opacity-20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(106,17,203,0.15),transparent_25%),radial-gradient(circle_at_85%_30%,rgba(2,29,77,0.4),transparent_25%)] parallax" data-speed="-0.05" />
      
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid opacity-30 transform perspective-1000 preserve-3d rotate-x-70 -translate-z-100 parallax" data-speed="0.02" />
      
      {/* Floating orbs */}
      <motion.div
        animate={{
          y: [0, -10, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute left-[10%] top-[20%] w-[300px] h-[300px] rounded-full bg-primary/5 blur-3xl parallax"
        data-speed="0.08"
      />
      <motion.div
        animate={{
          y: [0, -10, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
        className="absolute right-[15%] top-[50%] w-[250px] h-[250px] rounded-full bg-tertiary/5 blur-3xl parallax"
        data-speed="0.12"
      />
      
      <div className="relative z-10 mt-[15vh] mb-8">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-7xl md:text-8xl font-bold mb-4 tracking-tight"
        >
          <span className="relative inline-block bg-gradient-to-r from-[#6a11cb] via-[#2575fc] to-[#6a11cb] bg-[length:200%_auto] animate-gradient-shift bg-clip-text text-transparent ">
            Your
          </span>{' '}
          AI Code Editor
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="text-lg md:text-xl mb-8 font-mono"
        >
          Powered by local LLMs for lightning-fast responses,<br />
          Pointer brings AI-assisted coding right to your editor,<br />
          with zero latency and complete privacy.
        </motion.p>
        
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
          >
            <a
              href="https://discord.gg/vhgc8THmNk"
              target="_blank"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 text-white font-semibold shadow-lg transition-all duration-300 hover:translate-y-[-3px] hover:shadow-xl hover:bg-white/10 hover:border-white/20"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
              </svg>
              <span>COMING SOON</span>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
          >
            <Link
              href="https://github.com/f1shyondrugs/Pointer"
              target="_blank"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 text-white font-semibold shadow-lg transition-all duration-300 hover:translate-y-[-3px] hover:shadow-xl hover:bg-white/10 hover:border-white/20"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              You&apos;re welcome to contribute
            </Link>
          </motion.div>
        </div>
      </div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
        className="w-[90%] max-w-[1200px] mx-auto mt-12 rounded-xl overflow-hidden relative shadow-2xl border border-white/10 transition-all duration-500 ease-out hover:translate-y-[-5px] hover:shadow-[0_25px_100px_rgba(0,0,0,0.4),0_0_30px_rgba(99,102,241,0.2)] z-10"
      >
        <div className="editor-window">
          <div className="editor-content" style={{ padding: 0, margin: 0 }}>
            <Image
              src="/images/preview.png"
              alt="Editor Preview"
              width={1200}
              height={600}
              className="w-full h-auto block m-0 p-0"
            />
          </div>
        </div>
      </motion.div>
    </main>
  );
} 