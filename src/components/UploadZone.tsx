import { useCallback, useState } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

const UploadZone = ({ onFileSelected, isLoading }: UploadZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.toLowerCase().endsWith('.ifc')) {
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <label
        className={`upload-zone flex flex-col items-center justify-center p-8 cursor-pointer ${
          isDragOver ? 'drag-over' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".ifc"
          className="hidden"
          onChange={handleFileInput}
          disabled={isLoading}
        />
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10">
              <FileUp size={28} className="text-primary animate-pulse-glow" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Parsing IFC Model...</p>
              <p className="text-xs text-muted-foreground mt-1">Extracting geometry & quantities</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10">
              <Upload size={28} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Drop your <span className="glow-text font-semibold">.IFC</span> file here
              </p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </div>
          </div>
        )}
      </label>
    </motion.div>
  );
};

export default UploadZone;
