import React, { useState } from 'react';
import {
  Eye,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Activity,
  Users,
  Camera,
  CheckCircle2,
  Cpu,
  Layers,
  Stethoscope,
  Sparkles,
  ChevronRight,
  Shield,
  Scan,
  Zap,
  Info,
  X,
  ExternalLink,
} from 'lucide-react';
import trinayLogo from '../assets/logo.png';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useApp } from '../context/AppContext';

// Clinical Images
import cataractImg from '../assets/conditions/cataract.jpg';
import drImg from '../assets/conditions/diabetic_retinopathy.jpg';
import glaucomaImg from '../assets/conditions/glaucoma.jpg';

interface ConditionDetail {
  id: string;
  name: string;
  category: string;
  badge: string;
  image: string;
  description: string;
  symptoms: string[];
  clinicalSigns: string[];
  aiAnalysis: string;
  urgency: string;
}

export const LoginPage: React.FC = () => {
  const { loginWithCredentials } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<ConditionDetail | null>(null);

  const handleGmailSignIn = async () => {
    setError(null);
    setIsLoading(true);

    if (!isSupabaseConfigured()) {
      setError('Supabase service is not configured for Gmail authentication.');
      setIsLoading(false);
      return;
    }

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (oauthError) {
        setError(`Gmail login error: ${oauthError.message}`);
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize Gmail authentication.');
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const email = identifier.trim();
    if (!email) {
      setError('Please enter your Gmail, Clinician ID, or Mobile number.');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await loginWithCredentials(email, password);
      if (!res.success) {
        setError(res.error || 'Invalid credentials. Please verify your details.');
      }
    } catch {
      setError('Authentication failed. Please check your credentials and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (roleEmail: string) => {
    setIdentifier(roleEmail);
    setPassword('password');
    setError(null);
  };

  const conditionsData: ConditionDetail[] = [
    {
      id: 'cataract',
      name: 'Cataract',
      category: 'Anterior Segment Disease',
      badge: '5-Model Ensemble',
      image: cataractImg,
      description:
        'Clouding of the eye’s natural crystalline lens that prevents light from properly focusing on the retina, resulting in progressive blurriness, halo artifacts, and diminished color perception.',
      symptoms: [
        'Cloudy or misty vision',
        'Glare and halos around oncoming headlights or streetlights',
        'Faded colors and decreased night vision',
        'Frequent prescription changes in eyeglasses',
      ],
      clinicalSigns: [
        'Nuclear sclerosis / cortical opacities',
        'Posterior subcapsular lens density',
        'Reduced red reflex during slit-lamp illumination',
      ],
      aiAnalysis:
        '5-stage deep learning cascade performing automatic anterior eye localization, pupil & iris segmentation, and 5-model consensus verification.',
      urgency: 'Elective to High Priority depending on visual acuity impairment.',
    },
    {
      id: 'dr',
      name: 'Diabetic Retinopathy',
      category: 'Retinal Microvascular Disease',
      badge: 'Multi-Task XAI',
      image: drImg,
      description:
        'Microvascular damage to the retinal blood vessels caused by chronic hyperglycemia in diabetes mellitus, leading to microaneurysms, hemorrhages, hard exudates, and proliferative neovascularization.',
      symptoms: [
        'Floating dark spots or cobweb-like streaks',
        'Fluctuating or hazy vision',
        'Dark or blank areas in the visual field',
        'Sudden vision deterioration from vitreous hemorrhage',
      ],
      clinicalSigns: [
        'Dot and blot intraretinal hemorrhages',
        'Lipid hard exudates & cotton wool spots',
        'Venous beading & intraretinal microvascular abnormalities (IRMA)',
      ],
      aiAnalysis:
        'Multi-task CNN + Vision Transformer classification across all 5 ICDR severity grades with Grad-CAM++ lesion pixel heatmaps.',
      urgency: 'Early intervention (laser photocoagulation / anti-VEGF) prevents irreversible blindness.',
    },
    {
      id: 'glaucoma',
      name: 'Glaucoma',
      category: 'Optic Neuropathy',
      badge: 'CDR & RNFL Inspection',
      image: glaucomaImg,
      description:
        'A chronic, progressive optic neuropathy characterized by progressive loss of retinal ganglion cells and retinal nerve fiber layer (RNFL) thinning, often linked to elevated intraocular pressure.',
      symptoms: [
        'Often completely asymptomatic in early stages ("silent thief of sight")',
        'Gradual loss of peripheral (side) vision (tunnel vision)',
        'Severe eye pain, nausea, and halos in acute angle-closure episodes',
      ],
      clinicalSigns: [
        'Elevated vertical Cup-to-Disc Ratio (CDR > 0.6)',
        'Neuroretinal rim thinning (ISNT rule violation)',
        'Optic disc notch hemorrhages & peripapillary atrophy',
      ],
      aiAnalysis:
        'Automated optic cup and disc boundary segmentation with vertical CDR calculation and neuroretinal rim thickness profiling.',
      urgency: 'Early detection essential as lost visual field cannot be restored.',
    },
  ];

  const workflowSteps = [
    {
      number: '01',
      title: 'Patient',
      desc: 'Select or register the patient for screening.',
      icon: Users,
    },
    {
      number: '02',
      title: 'Image Capture / Upload',
      desc: 'Provide the appropriate eye image for the selected screening.',
      icon: Camera,
    },
    {
      number: '03',
      title: 'Image Quality Check',
      desc: 'Assess whether the image is suitable for analysis.',
      icon: CheckCircle2,
    },
    {
      number: '04',
      title: 'AI Screening',
      desc: 'Existing AI models analyze the image for supported findings.',
      icon: Cpu,
    },
    {
      number: '05',
      title: 'Visualization & Findings',
      desc: 'Display model-generated findings, anatomy, lesions, and visual explanations where available.',
      icon: Layers,
    },
    {
      number: '06',
      title: 'Doctor Review',
      desc: 'Doctor reviews the screening information and supporting visualizations.',
      icon: Stethoscope,
    },
    {
      number: '07',
      title: 'Clinical Decision Support',
      desc: 'Use the screening information to support clinical decision-making.',
      icon: Sparkles,
    },
  ];

  const scrollToLogin = () => {
    const el = document.getElementById('clinician-auth-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-[#0284C7] selection:text-white">
      {/* 1. Public Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={trinayLogo}
              alt="TRINAY Logo"
              className="h-10 w-auto max-h-[42px] object-contain shrink-0"
            />
            <div className="flex flex-col min-w-0 justify-center">
              <span
                className="text-xl sm:text-2xl font-black tracking-tight text-[#0F172A] leading-none"
                style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
              >
                TRINAY
              </span>
              <span
                className="text-[11px] font-semibold text-[#0284C7] tracking-normal leading-none mt-1"
                style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
              >
                Your Eye Health Assistant
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#eye-care-section" className="hover:text-[#0284C7] transition-colors">
              Eye Conditions
            </a>
            <a href="#workflow-section" className="hover:text-[#0284C7] transition-colors">
              How It Works
            </a>
            <a href="#clinician-auth-section" className="hover:text-[#0284C7] transition-colors">
              Clinician Portal
            </a>
          </nav>

          <button
            type="button"
            onClick={scrollToLogin}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>Doctor Sign In</span>
          </button>
        </div>
      </header>

      {/* 2. Hero Section & Clinician Gateway */}
      <section id="clinician-auth-section" className="relative bg-[#070D19] text-white py-16 lg:py-24 overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/3 -translate-x-1/2 w-[700px] h-[700px] bg-[#0284C7]/15 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Hero Copy */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs font-semibold text-sky-300">
                <ShieldCheck className="w-4 h-4 text-[#0284C7]" />
                <span>Next-Gen Ophthalmology Screening & Decision Support</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Precision Eye Screening Powered by Multi-Disease AI
              </h1>

              <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed max-w-2xl">
                TRINAY assists ophthalmologists, optometrists, and primary health clinics in rapid multi-disease evaluation across Diabetic Retinopathy, Cataract, and Glaucoma with explainable visual analytics.
              </p>

              {/* Trust Badges */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
                <div className="space-y-1">
                  <div className="text-xl font-bold text-white">3 Diseases</div>
                  <div className="text-slate-400">Multi-Model Pipeline</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl font-bold text-white">XAI Heatmaps</div>
                  <div className="text-slate-400">Grad-CAM++ Lesions</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl font-bold text-white">2-Step MFA</div>
                  <div className="text-slate-400">TOTP Authenticator</div>
                </div>
              </div>
            </div>

            {/* Right: Clinician Login Card */}
            <div className="lg:col-span-5">
              <div className="w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden">
                {/* Brand Header */}
                <div className="p-7 pb-5 text-center border-b border-slate-800/80">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 p-2 border border-slate-700/80 mb-2.5 shadow-lg shadow-sky-950/50">
                    <img src={trinayLogo} alt="TRINAY Logo" className="w-full h-full object-contain" />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-wide">
                    Clinician Authentication
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enter credentials or sign in with Google / Gmail
                  </p>
                </div>

                {/* Form */}
                <div className="p-7 pt-5 space-y-4">
                  {error && (
                    <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-start gap-2">
                      <span className="font-bold shrink-0">!</span>
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Gmail Service OAuth Button */}
                  <button
                    type="button"
                    onClick={handleGmailSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl shadow-md transition-all text-sm cursor-pointer disabled:opacity-70"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Sign In with Gmail / Google</span>
                  </button>

                  {/* Divider */}
                  <div className="relative flex items-center justify-center my-3.5">
                    <div className="border-t border-slate-800 w-full"></div>
                    <span className="bg-slate-900 px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 shrink-0">
                      Or Clinician Details
                    </span>
                    <div className="border-t border-slate-800 w-full"></div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    {/* Gmail / User ID */}
                    <div>
                      <label
                        htmlFor="login-identifier"
                        className="block text-xs font-semibold text-slate-300 mb-1.5"
                      >
                        Gmail / Clinician ID
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          id="login-identifier"
                          type="text"
                          required
                          autoComplete="username"
                          value={identifier}
                          onChange={(e) => {
                            setIdentifier(e.target.value);
                            setError(null);
                          }}
                          placeholder="doctor@gmail.com"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] transition-colors"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div>
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-semibold text-slate-300 mb-1.5"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          id="login-password"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError(null);
                          }}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] transition-colors"
                        />
                      </div>
                    </div>

                    {/* Log In Button */}
                    <button
                      id="login-submit-btn"
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#0284C7] hover:bg-sky-600 active:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-950/50 transition-all text-sm mt-1 disabled:opacity-70 cursor-pointer"
                    >
                      {isLoading ? (
                        <span>Authenticating Clinician...</span>
                      ) : (
                        <>
                          <span>Sign In to Dashboard</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Part 4 — Ophthalmology & Eye Care Section */}
      <section id="eye-care-section" className="py-20 lg:py-28 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold tracking-[0.08em] text-[#0284C7] uppercase">
                EXPLORE EYE CONDITIONS & CLINICAL SCREENING
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E0F2FE] text-[#0284C7] border border-sky-200">
                3 Major Diseases
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[48px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
              Ophthalmology & Eye Care
            </h2>

            <p className="text-base sm:text-[18px] text-slate-600 font-normal leading-relaxed">
              Learn about 3 core eye conditions, recognize early symptoms, and see how AI-assisted eye screening helps doctors protect your vision.
            </p>
          </div>

          {/* 3 Conditions Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {conditionsData.map((cond) => (
              <div
                key={cond.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between hover:border-sky-300 hover:shadow-md transition-all group"
              >
                <div>
                  {/* Image with 16:9 aspect ratio */}
                  <div className="relative h-48 w-full bg-slate-900 overflow-hidden">
                    <img
                      src={cond.image}
                      alt={cond.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                    
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-bold border border-white/10 shadow-xs">
                        <Activity className="w-3.5 h-3.5 text-[#0284C7]" />
                        <span>{cond.badge}</span>
                      </span>
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-[#0284C7] border border-sky-200 backdrop-blur-md">
                        {cond.category}
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="text-xl sm:text-[22px] font-extrabold text-white tracking-tight drop-shadow-sm">
                        {cond.name}
                      </h3>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 space-y-4">
                    <p className="text-sm sm:text-[15px] text-slate-600 font-normal leading-relaxed">
                      {cond.description}
                    </p>

                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                        Common Symptoms:
                      </span>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {cond.symptoms.slice(0, 2).map((symptom, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0 mt-1.5" />
                            <span>{symptom}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="px-6 pb-6 pt-0">
                  <button
                    type="button"
                    onClick={() => setSelectedCondition(cond)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-[#0284C7] text-slate-800 hover:text-white border border-slate-200 hover:border-[#0284C7] text-sm font-bold rounded-xl transition-all cursor-pointer group/btn"
                  >
                    <span>Learn More & Clinical Signs</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-all" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Part 5 — Diagnostic Workflow Section ("How TRINAY Works") */}
      <section id="workflow-section" className="py-20 lg:py-28 bg-white border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 text-[#0284C7] text-xs font-bold uppercase tracking-wider border border-sky-100">
              <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>CLINICAL DECISION SUPPORT PIPELINE</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
              How TRINAY Works
            </h2>

            <p className="text-base sm:text-[18px] text-slate-600 font-normal leading-relaxed">
              From patient image to AI-assisted screening and doctor review, TRINAY brings the clinical workflow together in one system.
            </p>
          </div>

          {/* Desktop Horizontal Connected Workflow / Responsive Grid */}
          <div className="relative mt-8">
            {/* Horizontal Connecting Line (Desktop) */}
            <div className="hidden lg:block absolute top-[4.5rem] left-8 right-8 h-1.5 bg-gradient-to-r from-sky-50 via-indigo-50 to-sky-50 rounded-full z-0 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-sky-300 via-indigo-400 to-sky-300 opacity-20 w-1/3 animate-[translateX_3s_ease-in-out_infinite]"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 lg:gap-5 relative z-10">
              {workflowSteps.map((step, idx) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className="relative p-5 bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col hover:-translate-y-2 hover:shadow-[0_20px_40px_rgb(14,165,233,0.15)] hover:border-sky-200 transition-all duration-300 group overflow-visible"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-sky-100/40 to-indigo-100/40 rounded-full blur-2xl -mr-10 -mt-10 transition-transform duration-500 group-hover:scale-150 pointer-events-none"></div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                      {/* Step Number & Icon */}
                      <div className="flex items-center justify-between mb-5">
                        <span className="text-xs font-black text-white bg-gradient-to-r from-sky-500 to-indigo-500 px-2.5 py-1 rounded-lg shadow-md shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-shadow">
                          {step.number}
                        </span>
                        <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 shadow-sm group-hover:bg-gradient-to-br group-hover:from-sky-400 group-hover:to-indigo-500 group-hover:text-white group-hover:border-transparent group-hover:shadow-lg group-hover:shadow-sky-500/30 transition-all duration-300">
                          <Icon className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                        </div>
                      </div>

                      <h3 className="text-sm font-extrabold text-slate-800 leading-tight mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-sky-600 group-hover:to-indigo-600 transition-colors">
                        {step.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed group-hover:text-slate-600 transition-colors">
                        {step.desc}
                      </p>
                    </div>

                    {/* Desktop Step Connector Line / Indicator */}
                    {idx < workflowSteps.length - 1 && (
                      <div className="hidden lg:flex absolute -right-[26px] top-[4.5rem] -translate-y-1/2 z-30">
                        <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-md shadow-slate-200 group-hover:border-sky-300 group-hover:bg-sky-50 group-hover:shadow-sky-500/20 transition-all duration-300">
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-500 group-hover:animate-pulse" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Condition Details Modal */}
      {selectedCondition && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Image Header */}
            <div className="relative h-56 w-full bg-slate-900">
              <img
                src={selectedCondition.image}
                alt={selectedCondition.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
              
              <button
                type="button"
                onClick={() => setSelectedCondition(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 text-white hover:bg-slate-900 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-4 left-6 right-6">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E0F2FE] text-[#0284C7] mb-2">
                  {selectedCondition.category}
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                  {selectedCondition.name}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Pathological Overview
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedCondition.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#0284C7]" />
                    <span>Patient Symptoms</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {selectedCondition.symptoms.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-[#0284C7] font-bold">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[#0284C7]" />
                    <span>Clinical Exam Signs</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {selectedCondition.clinicalSigns.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-teal-600 font-bold">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-sky-50 border border-sky-100">
                <h4 className="text-xs font-bold text-[#0284C7] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>TRINAY AI Screening Pipeline</span>
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {selectedCondition.aiAnalysis}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedCondition(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCondition(null);
                    scrollToLogin();
                  }}
                  className="px-5 py-2.5 bg-[#0284C7] hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Access Clinician Portal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Professional Compact Clinical Footer with Clinical Advisory Notice */}
      <footer className="bg-[#070D19] text-slate-400 py-3.5 sm:py-4 border-t border-slate-800/90 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2.5">
          {/* Clinical Advisory Notice Bar */}
          <div className="py-2 px-3.5 rounded-xl bg-slate-900/95 border border-sky-500/25 flex items-start sm:items-center gap-2.5 shadow-xs">
            <Info className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
              <strong className="text-white font-semibold">Clinical Advisory Notice:</strong> TRINAY is designed as an AI-assisted diagnostic decision support system to aid healthcare professionals during ocular screenings. It provides quantitative metrics and visual heatmaps but does not independently diagnose, prescribe, or replace physical examinations by a licensed ophthalmologist.
            </p>
          </div>

          {/* Bottom Bar: Logo, Branding, Copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-0.5">
            <div className="flex items-center gap-2.5">
              <img src={trinayLogo} alt="TRINAY Logo" className="h-6 w-auto object-contain shrink-0" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-tight">TRINAY AI</span>
                <span className="text-[11px] text-slate-500">•</span>
                <span className="text-[11px] text-slate-400 font-medium">Your Eye Health Assistant</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-1">
              <span>© {new Date().getFullYear()} TRINAY Health. All rights reserved.</span>
              <span className="hidden sm:inline text-slate-700">•</span>
              <span>Secure Ophthalmic AI Decision Support</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
