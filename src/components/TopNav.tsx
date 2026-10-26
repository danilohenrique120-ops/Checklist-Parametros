import React from 'react';
import { Table } from 'lucide-react';

interface TopNavProps {
  onOpenDORefModal: () => void;
  activeSection: 'dashboard' | 'averages' | 'trends' | 'table';
  onNavigate: (section: 'dashboard' | 'averages' | 'trends' | 'table') => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenDORefModal,
  activeSection,
  onNavigate,
}) => {
  const handleNavClick = (section: 'dashboard' | 'averages' | 'trends' | 'table') => {
    onNavigate(section);
    if (section === 'dashboard') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#080C14]/90 backdrop-blur-md border-b border-slate-800/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('dashboard');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-100 hover:text-cyan-400 transition-colors"
        >
          Checklist Parâmetros de Processo
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            onClick={() => handleNavClick('dashboard')}
            className={`transition-colors hover:text-slate-100 whitespace-nowrap ${
              activeSection === 'dashboard'
                ? 'text-cyan-400 font-semibold underline decoration-cyan-400 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => handleNavClick('averages')}
            className={`transition-colors hover:text-slate-100 whitespace-nowrap ${
              activeSection === 'averages'
                ? 'text-cyan-400 font-semibold underline decoration-cyan-400 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Médias dos Parâmetros
          </button>
          <button
            onClick={() => handleNavClick('trends')}
            className={`transition-colors hover:text-slate-100 whitespace-nowrap ${
              activeSection === 'trends'
                ? 'text-cyan-400 font-semibold underline decoration-cyan-400 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Gráficos de Tendência
          </button>
          <button
            onClick={() => handleNavClick('table')}
            className={`transition-colors hover:text-slate-100 whitespace-nowrap ${
              activeSection === 'table'
                ? 'text-cyan-400 font-semibold underline decoration-cyan-400 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Rastreabilidade GMP
          </button>
        </nav>

        {/* Zone 3: Curvas O2 Reference */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenDORefModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#131C2E] border border-slate-700/80 rounded-lg hover:bg-slate-800 hover:border-slate-600 transition-colors whitespace-nowrap"
          >
            <Table className="w-3.5 h-3.5 text-cyan-400" />
            Curvas O2
          </button>
        </div>
      </div>
    </header>
  );
};
