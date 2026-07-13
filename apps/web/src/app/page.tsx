"use client";

import React from "react";
import Link from "next/link";
import { 
  Zap, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Search, 
  TrendingUp, 
  Layers, 
  Settings, 
  Users, 
  BarChart3, 
  Layout, 
  Clock,
  HeartHandshake,
  Workflow
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="text-h4 font-bold tracking-tight text-slate-900">CoheronConnect</span>
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">by Coheron</p>
            </div>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <Link href="#features" className="text-body-sm font-medium text-slate-600 transition hover:text-indigo-600">Features</Link>
            <Link href="#why-coheron" className="text-body-sm font-medium text-slate-600 transition hover:text-indigo-600">Why Coheron</Link>
            <Link href="#pricing" className="text-body-sm font-medium text-slate-600 transition hover:text-indigo-600">Pricing</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-body-sm font-semibold text-slate-700 transition hover:text-indigo-600">
              Login →
            </Link>
            <Link 
              href="/signup" 
              className="hidden rounded-full bg-indigo-600 px-6 py-2.5 text-body-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-500 hover:shadow-indigo-500/40 sm:block"
            >
              Get Early Access →
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-6 pt-24 pb-20 lg:px-8 lg:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-caption font-bold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Enterprise-Grade Platform
            </div>
            <h1 className="text-display font-black tracking-tight text-slate-900 sm:text-7xl">
              Enterprise Workflow Orchestration <span className="block text-slate-400">at Startup-Friendly Pricing</span>
            </h1>
            <p className="mt-8 text-h4 leading-8 text-slate-600 max-w-2xl mx-auto">
              ITSM, asset management, HR service delivery, and procurement — without the ServiceNow price tag. Orchestrate everything in one powerful workspace.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link 
                href="/signup" 
                className="w-full rounded-full bg-indigo-600 px-8 py-4 text-body-lg font-bold text-white shadow-xl shadow-indigo-500/30 transition hover:bg-indigo-500 hover:shadow-indigo-500/50 sm:w-auto"
              >
                Get Started Free →
              </Link>
              <Link 
                href="#demo" 
                className="w-full rounded-full border-2 border-slate-200 bg-white px-8 py-4 text-body-lg font-bold text-slate-900 transition hover:border-indigo-600 hover:text-indigo-600 sm:w-auto"
              >
                Book a Demo
              </Link>
            </div>
          </div>

          {/* Product Showcase */}
          <div className="mx-auto mt-24 max-w-6xl px-4 lg:px-0">
            <div className="relative rounded-3xl bg-gradient-to-b from-indigo-50 to-white p-4 shadow-2xl ring-1 ring-slate-200">
              <img 
                src="/landing/showcase.png" 
                alt="CoheronConnect Dashboard" 
                className="rounded-2xl shadow-lg"
              />
            </div>
          </div>
        </section>

        {/* Feature Icons Section (Social Proof style) */}
        <section className="bg-slate-50 py-12 border-y border-slate-100">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
             <div className="flex flex-wrap justify-center gap-12 opacity-50 grayscale transition hover:grayscale-0">
                <div className="flex items-center gap-2 font-bold text-slate-600">
                  <ShieldCheck className="h-6 w-6" /> ITSM
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-600">
                  <BarChart3 className="h-6 w-6" /> BI & Analytics
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-600">
                  <Users className="h-6 w-6" /> HRSD
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-600">
                  <Layers className="h-6 w-6" /> CMDB
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-600">
                  <Workflow className="h-6 w-6" /> Automation
                </div>
             </div>
          </div>
        </section>

        {/* Core Features Grid */}
        <section id="features" className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-caption font-bold uppercase tracking-wider text-indigo-600">
                Our Core Features
              </span>
              <h2 className="mt-4 text-h1 font-black tracking-tight text-slate-900 sm:text-display">
                The Smarter Way to Get Work Done
              </h2>
              <p className="mt-6 text-body-lg leading-8 text-slate-600">
                Designed to ease the load for leaders and maximize productivity across teams.
              </p>
            </div>

            <div className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-8 sm:mt-24 lg:max-w-none lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-8 transition hover:shadow-xl hover:shadow-indigo-500/10">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
                  <Layout className="h-8 w-8 text-indigo-600" />
                </div>
                <img src="/landing/it-sm.png" alt="ITSM" className="mb-8 rounded-xl ring-1 ring-slate-100" />
                <h3 className="text-h4 font-bold text-slate-900">IT Service Management</h3>
                <p className="mt-4 text-slate-600">
                  Streamline incident, problem, and change management with automated workflows.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-8 transition hover:shadow-xl hover:shadow-indigo-500/10">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                  <HeartHandshake className="h-8 w-8 text-emerald-600" />
                </div>
                <img src="/landing/hr.png" alt="HRSD" className="mb-8 rounded-xl ring-1 ring-slate-100" />
                <h3 className="text-h4 font-bold text-slate-900">HR Service Delivery</h3>
                <p className="mt-4 text-slate-600">
                  Seamless employee onboarding, request fulfillment, and workplace management.
                </p>
              </div>

              {/* Feature 3 - Accent Card */}
              <div className="flex flex-col justify-between rounded-3xl bg-indigo-600 p-8 text-white shadow-2xl">
                <div>
                  <h3 className="text-h3 font-black">Save 70% costs</h3>
                  <p className="mt-4 opacity-80">
                    Replace multiple expensive subscriptions with one simple plan.
                  </p>
                </div>
                <div className="mt-12">
                   <div className="text-display font-black">10X</div>
                   <p className="text-h4 font-bold opacity-80">Productivity</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Coheron Section */}
        <section id="why-coheron" className="bg-slate-50 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-h1 font-black tracking-tight text-slate-900 sm:text-display">Why CoheronConnect</h2>
              <p className="mt-6 text-body-lg leading-8 text-slate-600">
                Explore the tools and capabilities that elevate your productivity and streamline tasks.
              </p>
            </div>

            <div className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:max-w-none lg:grid-cols-3">
              {[
                { title: "No more juggling apps", icon: Zap, desc: "End app-switching fatigue. Everything your team needs is in one unified workspace." },
                { title: "Save 70% on your costs", icon: TrendingUp, desc: "Replace ServiceNow and Jira with one platform and slash software expenses." },
                { title: "Increase productivity", icon: Clock, desc: "No more lost requests or forgotten tasks - streamline everything with integrated workflows." },
                { title: "Unified Search", icon: Search, desc: "Find anything instantly across messages, files, tickets, and assets in one search." },
                { title: "Perfect Team Sync", icon: CheckCircle2, desc: "Turn chaos into clarity with real-time updates across projects and meetings." },
                { title: "Flexible platform", icon: Settings, desc: "Easily customize workflows, views, and templates to fit how your team works best." }
              ].map((benefit) => (
                <div key={benefit.title} className="rounded-3xl border border-slate-200 bg-white p-8 transition hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                    <benefit.icon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <h3 className="text-body-lg font-bold text-slate-900">{benefit.title}</h3>
                  <p className="mt-4 text-body-sm leading-6 text-slate-600">{benefit.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cost Comparison Section */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="rounded-[3rem] bg-slate-900 px-8 py-20 text-center shadow-3xl sm:px-16">
              <h2 className="mx-auto max-w-3xl text-h1 font-black tracking-tight text-white sm:text-6xl">
                Ready to stop overpaying for legacy software?
              </h2>
              <p className="mx-auto mt-8 max-w-2xl text-h4 leading-8 text-slate-400">
                Join high-performance teams moving from ServiceNow to CoheronConnect and save up to 70% on licensing fees.
              </p>
              <div className="mt-12 flex justify-center">
                <Link 
                  href="/signup" 
                  className="rounded-full bg-white px-10 py-4 text-body-lg font-bold text-slate-900 shadow-xl transition hover:bg-slate-100"
                >
                  Start Free Trial
                </Link>
              </div>
              <p className="mt-6 text-body-sm text-slate-500 italic">No credit card required. Cancel anytime.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-indigo-600" />
                <span className="text-h4 font-bold tracking-tight text-slate-900">CoheronConnect</span>
              </div>
              <p className="mt-6 max-w-xs text-body-sm leading-6 text-slate-500">
                Enterprise workflow orchestration, ITSM, and HR service delivery — without the complexity or cost of legacy platforms.
              </p>
              <p className="mt-8 text-caption text-slate-400">© 2026 Coheron. All rights reserved.</p>
            </div>
            <div>
              <h3 className="text-body-sm font-bold uppercase tracking-wider text-slate-900">Platform</h3>
              <ul className="mt-6 space-y-4">
                <li><Link href="#" className="text-body-sm text-slate-600 hover:text-indigo-600">Features</Link></li>
                <li><Link href="#" className="text-body-sm text-slate-600 hover:text-indigo-600">Pricing</Link></li>
                <li><Link href="#" className="text-body-sm text-slate-600 hover:text-indigo-600">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-body-sm font-bold uppercase tracking-wider text-slate-900">Support</h3>
              <ul className="mt-6 space-y-4">
                <li><Link href="#" className="text-body-sm text-slate-600 hover:text-indigo-600">Documentation</Link></li>
                <li><Link href="#" className="text-body-sm text-slate-600 hover:text-indigo-600">Privacy Policy</Link></li>
                <li><Link href="#" className="text-body-sm text-slate-600 hover:text-indigo-600">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
