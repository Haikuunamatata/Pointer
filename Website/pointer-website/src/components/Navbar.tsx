'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';

interface NavbarProps {
  showPricingLink?: boolean;
  showDownloadsLink?: boolean;
  showTextLogo?: boolean;
  featuresPath?: string;
}

export default function Navbar({
  showPricingLink = true,
  showDownloadsLink = false,
  showTextLogo = false,
  featuresPath = '#features',
}: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-background/90 backdrop-blur-md border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Image
                src="/images/logo.png"
                alt="Pointer Logo"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              {showTextLogo && (
                <span className="ml-2 text-xl font-bold text-white">Pointer</span>
              )}
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href={featuresPath}
              className="text-white/70 hover:text-white transition-colors duration-300"
            >
              Features
            </Link>
            <Link
              href="https://github.com/f1shyondrugs/Pointer"
              target="_blank"
              className="text-white/70 hover:text-white transition-colors duration-300"
            >
              GitHub
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-white/70 hover:text-white transition-colors duration-300"
            >
              {isOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden bg-background/90 backdrop-blur-md border-t border-white/10"
          >
            <div className="px-4 py-4 space-y-4">
              <Link
                href={featuresPath}
                className="block text-white/70 hover:text-white transition-colors duration-300"
                onClick={() => setIsOpen(false)}
              >
                Features
              </Link>
              {showPricingLink && (
                <Link
                  href="#pricing"
                  className="block text-white/70 hover:text-white transition-colors duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  Pricing
                </Link>
              )}
              {showDownloadsLink && (
                <Link
                  href="#downloads"
                  className="block text-white/70 hover:text-white transition-colors duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  Downloads
                </Link>
              )}
              <Link
                href="https://github.com/f1shyondrugs/Pointer"
                target="_blank"
                className="block text-white/70 hover:text-white transition-colors duration-300"
                onClick={() => setIsOpen(false)}
              >
                GitHub
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
} 