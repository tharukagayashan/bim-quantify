import { Building2, MapPin, Layers, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import type { IFCBuildingData } from '@/lib/ifc-parser';

interface BuildingHierarchyProps {
  data: IFCBuildingData | null;
  selectedStoreyID: number | null;
  onSelectStorey: (storeyID: number | null) => void;
}

const BuildingHierarchy = ({ data, selectedStoreyID, onSelectStorey }: BuildingHierarchyProps) => {
  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        <Layers size={32} className="mx-auto mb-2 opacity-30" />
        <p>Upload an IFC file to view the building hierarchy</p>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-1 p-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Project */}
      <div className="hierarchy-item active">
        <FolderOpen size={16} />
        <span className="font-medium truncate">{data.projectName}</span>
      </div>

      {/* Site */}
      <div className="hierarchy-item pl-6">
        <MapPin size={14} />
        <span className="truncate">{data.siteName}</span>
      </div>

      {/* Building */}
      <button
        onClick={() => onSelectStorey(null)}
        className={`hierarchy-item pl-10 w-full ${selectedStoreyID === null ? 'bg-primary/10 text-primary' : ''}`}
      >
        <Building2 size={14} />
        <span className="truncate">{data.buildingName}</span>
        {selectedStoreyID === null && (
          <span className="ml-auto text-xs font-mono text-primary">All</span>
        )}
      </button>

      {/* Storeys */}
      {data.storeys.map((storey) => (
        <button
          key={storey.expressID}
          onClick={() => onSelectStorey(storey.expressID)}
          className={`hierarchy-item pl-14 w-full ${selectedStoreyID === storey.expressID ? 'bg-primary/10 text-primary' : ''}`}
        >
          <Layers size={12} />
          <span className="truncate">{storey.name}</span>
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {storey.elevation.toFixed(1)}m
          </span>
        </button>
      ))}
    </motion.div>
  );
};

export default BuildingHierarchy;
