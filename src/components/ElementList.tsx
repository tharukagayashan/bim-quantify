import { useState } from 'react';
import { ChevronDown, ChevronRight, Cuboid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { IFCElementData } from '@/lib/ifc-parser';

interface ElementListProps {
  elements: IFCElementData[];
}

const TYPE_LABELS: Record<string, string> = {
  IfcWall: 'Walls',
  IfcWallStandardCase: 'Walls',
  IfcSlab: 'Slabs',
  IfcColumn: 'Columns',
  IfcBeam: 'Beams',
  IfcWindow: 'Windows',
  IfcDoor: 'Doors',
  IfcRoof: 'Roofs',
  IfcStair: 'Stairs',
  IfcRailing: 'Railings',
  IfcCovering: 'Coverings',
  IfcPlate: 'Plates',
  IfcMember: 'Members',
  IfcCurtainWall: 'Curtain Walls',
  IfcFooting: 'Footings',
  IfcPile: 'Piles',
  IfcBuildingElementProxy: 'Other Elements',
};

function getGroupLabel(type: string): string {
  return TYPE_LABELS[type] || type.replace('Ifc', '');
}

function fmt(val: number | null): string {
  if (val == null) return '—';
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const ElementList = ({ elements }: ElementListProps) => {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  if (elements.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        <Cuboid size={32} className="mx-auto mb-2 opacity-30" />
        <p>No element data available</p>
      </div>
    );
  }

  // Group elements by display label
  const grouped = new Map<string, IFCElementData[]>();
  for (const el of elements) {
    const label = getGroupLabel(el.type);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push(el);
  }

  const toggle = (group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="space-y-0.5 p-2">
      {Array.from(grouped.entries()).map(([group, items]) => {
        const isOpen = openGroups.has(group);
        const totalArea = items.reduce((s, e) => s + (e.area ?? 0), 0);
        const totalVol = items.reduce((s, e) => s + (e.volume ?? 0), 0);
        const hasArea = items.some((e) => e.area != null);
        const hasVol = items.some((e) => e.volume != null);

        return (
          <div key={group}>
            <button
              onClick={() => toggle(group)}
              className="hierarchy-item w-full justify-between"
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="font-medium">{group}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  ({items.length})
                </span>
              </span>
              <span className="flex gap-3 text-xs font-mono text-muted-foreground">
                {hasArea && <span>{fmt(totalArea)} m²</span>}
                {hasVol && <span>{fmt(totalVol)} m³</span>}
              </span>
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {items.map((el) => (
                    <div
                      key={el.id}
                      className="flex items-center gap-2 pl-8 pr-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50 rounded-md transition-colors"
                    >
                      <Cuboid size={10} className="shrink-0 opacity-40" />
                      <span className="truncate flex-1">{el.name}</span>
                      <span className="font-mono shrink-0">
                        {el.area != null && <span className="mr-3">{fmt(el.area)} m²</span>}
                        {el.volume != null && <span>{fmt(el.volume)} m³</span>}
                        {el.area == null && el.volume == null && '—'}
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

export default ElementList;
