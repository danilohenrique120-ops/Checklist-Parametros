import React from 'react';
import { ScaleVolume } from '../types/bioreactor';
import {
  LayoutDashboard,
  SlidersHorizontal,
  TrendingUp,
  ClipboardList,
  Table,
  FileDown,
  FileSpreadsheet,
  Plus,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const BioreactorIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Motor / Cabeçote Superior de Agitação */}
    <rect x="9.5" y="1.5" width="5" height="2.8" rx="0.8" />
    {/* Tubulações / Conexões Superiores */}
    <path d="M7 5.5V3.8h1.5" />
    <path d="M17 5.5V3.8h-1.5" />
    {/* Corpo Cilíndrico do Biorreator com Fundo Torisférico */}
    <path d="M5.5 6.5C5.5 5.4 8.4 4.5 12 4.5C15.6 4.5 18.5 5.4 18.5 6.5V15.5C18.5 18.2 15.6 20 12 20C8.4 20 5.5 18.2 5.5 15.5V6.5Z" />
    {/* Nível do Meio de Cultivo */}
    <path d="M5.8 11.5C8 12.3 10 10.7 12 11.5C14 12.3 16 10.7 18.2 11.5" strokeOpacity="0.65" />
    {/* Eixo Central do Agitador */}
    <line x1="12" y1="4.5" x2="12" y2="16.5" />
    {/* Impelidores (Pás de Agitação Superior e Inferior) */}
    <path d="M9 10.5L15 10.5" />
    <path d="M8.5 15L15.5 15" />
    {/* Pés de Sustentação do Tanque */}
    <path d="M7.5 19L6.5 22" />
    <path d="M16.5 19L17.5 22" />
    {/* Válvula de Fundo */}
    <path d="M12 20V22" />
  </svg>
);

interface TopNavProps {
  onOpenDORefModal: () => void;
  activeSection: 'dashboard' | 'averages' | 'trends' | 'table';
  onNavigate: (section: 'dashboard' | 'averages' | 'trends' | 'table') => void;
  selectedScale?: ScaleVolume | 'all';
  onSelectScale?: (scale: ScaleVolume | 'all') => void;
  scaleCounts?: Record<ScaleVolume | 'all', number>;
  onOpenChecklist?: () => void;
  onOpenPDFModal?: () => void;
  onExportExcel?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenDORefModal,
  activeSection,
  onNavigate,
  selectedScale = 'all',
  onSelectScale,
  scaleCounts,
  onOpenChecklist,
  onOpenPDFModal,
  onExportExcel,
  isCollapsed = false,
  onToggleCollapse,
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

  const navItems: {
    id: 'dashboard' | 'averages' | 'trends' | 'table';
    label: string;
    icon: React.ElementType;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trends', label: 'Gráficos Studio', icon: TrendingUp },
    { id: 'averages', label: 'Médias por Escala', icon: SlidersHorizontal },
    {
      id: 'table',
      label: 'Histórico & OPs',
      icon: ClipboardList,
      badge: scaleCounts?.all,
    },
  ];

  const scaleFilters: { key: ScaleVolume | 'all'; label: string; shortLabel: string }[] = [
    { key: 'all', label: 'Todas as Escalas', shortLabel: 'ALL' },
    { key: '100L', label: 'Escala 100L', shortLabel: '100L' },
    { key: '500L', label: 'Escala 500L', shortLabel: '500L' },
    { key: '3000L', label: 'Escala 3000L', shortLabel: '3KL' },
    { key: '5000L', label: 'Escala 5000L', shortLabel: '5KL' },
  ];

  return (
    <>
      {/* Desktop Glassmorphic Left Sidebar (Video Style with Collapsible Icon Mode) */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-3 lg:left-3 z-40 rounded-3xl glass-panel py-5 select-none justify-between overflow-y-auto overflow-x-hidden transition-all duration-300 ${
          isCollapsed ? 'lg:w-[76px] px-2.5 items-center' : 'lg:w-64 px-4'
        }`}
      >
        <div className={`space-y-6 w-full ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {/* Brand Header & Collapse Toggle Button */}
          <div
            className={`flex items-center w-full ${
              isCollapsed ? 'flex-col gap-3 justify-center' : 'justify-between px-1'
            }`}
          >
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleNavClick('dashboard');
              }}
              title="Biorreatores · Ir para o topo"
              className="flex items-center justify-center group"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-[0_0_24px_rgba(37,99,235,0.5)] shrink-0">
                <BioreactorIcon className="w-5 h-5" />
              </div>
            </a>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title={isCollapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral'}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all shrink-0"
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-blue-400" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          {/* Primary Navigation */}
          <div className="w-full">
            {!isCollapsed && (
              <span className="px-3 text-[11px] font-medium text-slate-500 block mb-2">
                Navegação
              </span>
            )}
            <nav className={`space-y-1.5 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={
                      typeof item.badge === 'number'
                        ? `${item.label} (${item.badge})`
                        : item.label
                    }
                    className={`relative flex items-center rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                      isCollapsed
                        ? 'w-11 h-11 justify-center'
                        : 'w-full justify-between px-3.5 py-2.5'
                    } ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-[0_6px_22px_rgba(37,99,235,0.45)]'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      {!isCollapsed && item.label}
                    </span>
                    {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-[9px] font-mono font-bold text-white flex items-center justify-center border border-[#050811]">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Scale Filter Section */}
          {onSelectScale && (
            <div className="w-full pt-2 border-t border-white/[0.06]">
              {!isCollapsed && (
                <span className="px-3 text-[11px] font-medium text-slate-500 block mb-2">
                  Escalas da Planta
                </span>
              )}
              <div className={`space-y-1 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
                {scaleFilters.map((sf) => {
                  const isSelected = selectedScale === sf.key;
                  const count = scaleCounts ? scaleCounts[sf.key] : undefined;
                  return (
                    <button
                      key={sf.key}
                      onClick={() => onSelectScale(sf.key)}
                      title={
                        typeof count === 'number'
                          ? `${sf.label} (${count} leituras)`
                          : sf.label
                      }
                      className={`flex items-center rounded-xl text-xs transition-all whitespace-nowrap ${
                        isCollapsed
                          ? 'w-11 h-9 justify-center font-mono text-[10px] font-bold'
                          : 'w-full justify-between px-3.5 py-2'
                      } ${
                        isSelected
                          ? 'bg-white/[0.08] text-white font-semibold border border-blue-500/40 shadow-[0_0_12px_rgba(37,99,235,0.25)]'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      {isCollapsed ? (
                        <span className={isSelected ? 'text-blue-400' : 'text-slate-400'}>
                          {sf.shortLabel}
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-2.5">
                            <Layers
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected ? 'text-blue-400' : 'text-slate-500'
                              }`}
                            />
                            {sf.label}
                          </span>
                          {typeof count === 'number' && (
                            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {count}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Tools & Quick Actions */}
        <div
          className={`space-y-1.5 pt-4 border-t border-white/[0.07] w-full ${
            isCollapsed ? 'flex flex-col items-center' : ''
          }`}
        >
          {!isCollapsed && (
            <span className="px-3 text-[11px] font-medium text-slate-500 block mb-1">
              Ferramentas & Exportação
            </span>
          )}
          <button
            onClick={onOpenDORefModal}
            title="Tabela Curvas O2"
            className={`flex items-center rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap ${
              isCollapsed ? 'w-11 h-10 justify-center' : 'w-full gap-3 px-3.5 py-2'
            }`}
          >
            <Table className="w-4 h-4 text-blue-400 shrink-0" />
            {!isCollapsed && 'Tabela Curvas O2'}
          </button>
          {onOpenPDFModal && (
            <button
              onClick={onOpenPDFModal}
              title="Relatório em PDF"
              className={`flex items-center rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap ${
                isCollapsed ? 'w-11 h-10 justify-center' : 'w-full gap-3 px-3.5 py-2'
              }`}
            >
              <FileDown className="w-4 h-4 text-amber-400 shrink-0" />
              {!isCollapsed && 'Relatório em PDF'}
            </button>
          )}
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              title="Exportar Planilha Excel"
              className={`flex items-center rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap ${
                isCollapsed ? 'w-11 h-10 justify-center' : 'w-full gap-3 px-3.5 py-2'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              {!isCollapsed && 'Exportar Planilha Excel'}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile / Tablet Sticky Header */}
      <header className="lg:hidden sticky top-0 z-40 glass-panel border-b border-white/10">
        <div className="px-4 h-15 flex items-center justify-between gap-4">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('dashboard');
            }}
            title="Biorreatores · Ir para o topo"
            className="flex items-center text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-[0_0_16px_rgba(37,99,235,0.5)]">
              <BioreactorIcon className="w-5 h-5" />
            </span>
          </a>

          <nav className="flex items-center gap-1 overflow-x-auto py-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === item.id
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {onOpenChecklist && (
            <button
              onClick={onOpenChecklist}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 shadow-[0_0_18px_rgba(37,99,235,0.45)]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              Check
            </button>
          )}
        </div>
      </header>
    </>
  );
};

