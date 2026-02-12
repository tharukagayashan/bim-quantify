import { useState, useCallback, useMemo } from 'react';
import { Ruler, Box, Move, Layers, Building2, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import StatsCard from '@/components/StatsCard';
import UploadZone from '@/components/UploadZone';
import BuildingHierarchy from '@/components/BuildingHierarchy';
import ElementList from '@/components/ElementList';
import IFCViewer from '@/components/IFCViewer';
import { parseIFCFile, extractIFCGeometry, type IFCBuildingData, type IFCMeshData } from '@/lib/ifc-parser';

const Index = () => {
  const [buildingData, setBuildingData] = useState<IFCBuildingData | null>(null);
  const [allMeshes, setAllMeshes] = useState<IFCMeshData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedStoreyID, setSelectedStoreyID] = useState<number | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    setSelectedStoreyID(null);
    try {
      const buffer = await file.arrayBuffer();
      const [data, geometry] = await Promise.all([
        parseIFCFile(buffer),
        extractIFCGeometry(buffer),
      ]);
      setBuildingData(data);
      setAllMeshes(geometry);
    } catch (error) {
      console.error('Error parsing IFC file:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter meshes by selected storey
  const filteredMeshes = useMemo(() => {
    if (!selectedStoreyID || !buildingData) return allMeshes;
    const storey = buildingData.storeys.find(s => s.expressID === selectedStoreyID);
    if (!storey) return allMeshes;
    const allowedIDs = new Set(storey.elementIDs);
    console.log(`[Filter] Storey "${storey.name}" has ${allowedIDs.size} element IDs, total meshes: ${allMeshes.length}`);
    // Log a sample of mesh expressIDs vs allowed IDs
    if (allMeshes.length > 0) {
      const sampleMeshIDs = allMeshes.slice(0, 5).map(m => m.expressID);
      const sampleAllowedIDs = [...allowedIDs].slice(0, 5);
      console.log(`[Filter] Sample mesh expressIDs: ${sampleMeshIDs.join(', ')}`);
      console.log(`[Filter] Sample allowed IDs: ${sampleAllowedIDs.join(', ')}`);
    }
    const result = allMeshes.filter(m => allowedIDs.has(m.expressID));
    console.log(`[Filter] Filtered to ${result.length} meshes`);
    return result;
  }, [allMeshes, selectedStoreyID, buildingData]);

  const formatValue = (val: number | null): string => {
    if (val == null) return 'N/A';
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">
                BIM Model Analyzer
              </h1>
              <p className="text-xs text-muted-foreground">
                IFC Quantity Takeoff & 3D Preview
              </p>
            </div>
          </div>
          {fileName && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground"
            >
              <Activity size={14} className="text-primary" />
              <span className="font-mono text-xs">{fileName}</span>
            </motion.div>
          )}
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside className="w-72 border-r border-border bg-card/30 flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground mb-3">Upload Model</h2>
            <UploadZone onFileSelected={handleFileSelected} isLoading={isLoading} />
          </div>
          <div className="flex-1 overflow-auto">
            <div className="p-4 pb-2">
              <h2 className="text-sm font-semibold text-foreground mb-2">Building Hierarchy</h2>
            </div>
            <BuildingHierarchy
              data={buildingData}
              selectedStoreyID={selectedStoreyID}
              onSelectStorey={setSelectedStoreyID}
            />
            <div className="p-4 pb-2 border-t border-border mt-2">
              <h2 className="text-sm font-semibold text-foreground mb-2">Elements</h2>
            </div>
            <ElementList elements={buildingData?.elements ?? []} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 p-6">
            <StatsCard title="Gross Floor Area" value={formatValue(buildingData?.grossFloorArea ?? null)} unit="m²" icon={Ruler} delay={0} />
            <StatsCard title="Total Volume" value={formatValue(buildingData?.totalVolume ?? null)} unit="m³" icon={Box} delay={0.1} />
            <StatsCard title="Building Perimeter" value={formatValue(buildingData?.perimeter ?? null)} unit="m" icon={Move} delay={0.2} />
            <StatsCard title="Total Storeys" value={buildingData?.storeyCount ?? 'N/A'} unit="floors" icon={Layers} delay={0.3} />
          </div>

          {/* 3D Viewer */}
          <div className="flex-1 px-6 pb-6">
            <IFCViewer meshes={filteredMeshes} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
