import Hero from '../components/Hero';
import Features from '../components/Features';
import Community from '../components/Community';
import Showcase from '../components/Showcase';
import GetStarted from '../components/GetStarted';
import Footer from '../components/Footer';
import Testimonials from '../components/Testimonials';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-white">
      <Hero />
      <Features />
      <Showcase />
      <Community />
      <Testimonials />
      <GetStarted />
      <Footer />
    </div>
  );
}
