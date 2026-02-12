import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box } from 'lucide-react';
import type { IFCMeshData } from '@/lib/ifc-parser';

interface IFCViewerProps {
  meshes: IFCMeshData[];
}

const IFCViewer = ({ meshes }: IFCViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<{
    rotX: number; rotY: number; distance: number; target: THREE.Vector3;
    updateCamera: () => void;
  } | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12161e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 10000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0x88ccff, 0.3);
    dirLight2.position.set(-10, 5, -10);
    scene.add(dirLight2);

    // Grid
    const grid = new THREE.GridHelper(100, 50, 0x2a3040, 0x1a2030);
    scene.add(grid);

    setIsReady(true);

    // Orbit controls
    let isDragging = false;
    let isPanning = false;
    let prevX = 0, prevY = 0;
    let rotX = -0.5, rotY = 0.5;
    let distance = 50;
    const target = new THREE.Vector3(0, 0, 0);

    const updateCamera = () => {
      camera.position.set(
        target.x + distance * Math.sin(rotY) * Math.cos(rotX),
        target.y + distance * Math.sin(rotX),
        target.z + distance * Math.cos(rotY) * Math.cos(rotX)
      );
      camera.lookAt(target);
    };
    updateCamera();
    orbitRef.current = { rotX, rotY, distance, target, updateCamera };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 1) {
        isPanning = true;
      } else {
        isDragging = true;
      }
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isPanning) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      
      if (isPanning) {
        // Pan
        const panSpeed = distance * 0.002;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(new THREE.Vector3());
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        up.setFromMatrixColumn(camera.matrixWorld, 1);
        target.addScaledVector(right, -dx * panSpeed);
        target.addScaledVector(up, dy * panSpeed);
      } else {
        rotY += dx * 0.005;
        rotX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, rotX + dy * 0.005));
      }
      prevX = e.clientX;
      prevY = e.clientY;
      updateCamera();
    };
    const onMouseUp = () => { isDragging = false; isPanning = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      distance = Math.max(1, Math.min(5000, distance * (1 + e.deltaY * 0.001)));
      updateCamera();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const el = renderer.domElement;
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Add meshes when they change
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !isReady) return;
    const scene = sceneRef.current;

    // Remove old mesh groups (keep lights, grid, helpers)
    const toRemove = scene.children.filter(c => c.type === 'Group' || c.type === 'Mesh');
    toRemove.forEach(m => scene.remove(m));

    if (meshes.length === 0) return;

    const group = new THREE.Group();
    const box = new THREE.Box3();

    meshes.forEach((meshData) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
      geometry.computeVertexNormals();

      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(meshData.color.r, meshData.color.g, meshData.color.b),
        opacity: meshData.color.a,
        transparent: meshData.color.a < 1,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
    });

    scene.add(group);
    box.setFromObject(group);

    // Center camera on model
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0 && orbitRef.current) {
      const orbit = orbitRef.current;
      orbit.target.copy(center);
      orbit.distance = maxDim * 2;
      orbit.updateCamera();
    }
  }, [meshes, isReady]);

  return (
    <div className="viewer-container relative w-full h-full min-h-[400px]">
      <div ref={containerRef} className="w-full h-full min-h-[400px]" />
      {meshes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
          <Box size={48} className="opacity-20 mb-3" />
          <p className="text-sm opacity-50">3D Preview</p>
          <p className="text-xs opacity-30">Upload an IFC file to render</p>
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex gap-2">
        <div className="px-2.5 py-1 rounded-md bg-card/80 backdrop-blur border border-border text-xs text-muted-foreground">
          Drag to rotate • Right-drag to pan • Scroll to zoom
        </div>
      </div>
    </div>
  );
};

export default IFCViewer;
