'use client';

import Link from 'next/link';
import { Palette, Share2, Shield, Zap, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 relative overflow-hidden flex flex-col justify-between">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />

      {/* Header */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            A
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Antigravity Board
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-lg bg-zinc-800 text-sm font-medium text-white hover:bg-zinc-700 transition-all border border-zinc-700/50"
          >
            Sign Up
          </Link>
        </div>
      </header>

      {/* Hero Content */}
      <main className="max-w-7xl mx-auto px-6 py-12 md:py-24 flex flex-col items-center text-center z-10 flex-1 justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 mb-8">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Production-grade Canvas Engine
        </div>

        <h1 className="text-4xl md:text-7xl font-extrabold tracking-tight text-white mb-6 max-w-4xl leading-tight">
          Collaborate on a{' '}
          <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-pink-500 bg-clip-text text-transparent">
            whiteboard
          </span>{' '}
          with zero lag.
        </h1>

        <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          Create, edit, and export vector diagrams with multiple users in real-time. Powered by a raw HTML5 canvas rendering engine, optimized cursors sync, and persistent workspaces.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center mb-20">
          <Link
            href="/dashboard"
            className="px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 group"
          >
            Launch Workspace
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/signup"
            className="px-8 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 font-semibold text-zinc-300 transition-all"
          >
            Create Free Account
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 w-full max-w-6xl">
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-900 hover:border-zinc-800/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-400 mb-4">
              <Palette className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2">Canvas Engine</h3>
            <p className="text-zinc-500 text-sm">
              Vector paths, shapes, and arrows, rendered using high performance requestAnimationFrame.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-900 hover:border-zinc-800/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-violet-600/10 flex items-center justify-center text-violet-400 mb-4">
              <Share2 className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2">Live Collaboration</h3>
            <p className="text-zinc-500 text-sm">
              Join rooms instantaneously. Broadcast cursors, presence, and shape operations via Socket.IO.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-900 hover:border-zinc-800/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-pink-600/10 flex items-center justify-center text-pink-400 mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2">Undo/Redo History</h3>
            <p className="text-zinc-500 text-sm">
              Isolated user-action history. Undo your changes without wiping out collaborator updates.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-900 hover:border-zinc-800/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-emerald-600/10 flex items-center justify-center text-emerald-400 mb-4">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2">Persistent Rooms</h3>
            <p className="text-zinc-500 text-sm">
              Saves are debounced automatically. Load rooms back up to find your work preserved.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 text-center text-sm text-zinc-600">
        <p>&copy; {new Date().getFullYear()} Antigravity Board. All rights reserved.</p>
      </footer>
    </div>
  );
}
