import React from 'react';
import { Plus, FileDown, Table, Cloud, LogIn, LogOut } from 'lucide-react';
import { User } from 'firebase/auth';

interface TopNavProps {
  onOpenChecklist: () => void;
  onOpenPDFModal: () => void;
  onOpenDORefModal: () => void;
  activeSection: 'dashboard' | 'averages' | 'trends' | 'table';
  onNavigate: (section: 'dashboard' | 'averages' | 'trends' | 'table') => void;
  user: User | null;
  isCloudSynced: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenChecklist,
  onOpenPDFModal,
  onOpenDORefModal,
  activeSection,
  onNavigate,
  user,
  isCloudSynced,
  onSignIn,
  onSignOut,
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
          className="text-lg font-bold tracking-tight text-slate-100 hover:text-cyan-400 transition-colors"
        >
          BioTrack Bioprocess
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
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
          <button
            onClick={onOpenDORefModal}
            className="transition-colors hover:text-slate-100 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Table className="w-3.5 h-3.5 text-cyan-500" />
            Curvas O2
          </button>
        </nav>

        {/* Zone 3: Cloud Sync + Primary Actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-950/35 border border-emerald-500/40 text-xs">
              <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-300 font-medium truncate max-w-[130px]" title={user.email || ''}>
                {isCloudSynced ? 'Nuvem Ativa' : 'Sincronizando...'} · {user.displayName?.split(' ')[0] || 'Operador'}
              </span>
              <button
                onClick={onSignOut}
                title="Sair da conta Google"
                className="text-slate-400 hover:text-rose-400 transition-colors ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-cyan-300 bg-cyan-950/50 border border-cyan-500/50 rounded-lg hover:bg-cyan-900/60 transition-colors whitespace-nowrap"
              title="Entrar com Google para sincronizar dados em tempo real com toda a equipe"
            >
              <LogIn className="w-3.5 h-3.5 text-cyan-400" />
              Sincronizar Nuvem
            </button>
          )}

          <button
            onClick={onOpenPDFModal}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-[#131C2E] border border-slate-700/80 rounded-lg hover:bg-slate-800 hover:border-slate-600 transition-colors whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5 text-cyan-400" />
            PDF
          </button>

          <button
            onClick={onOpenChecklist}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            Novo Checklist
          </button>
        </div>
      </div>
    </header>
  );
};

