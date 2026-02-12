import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Box, Ruler, MousePointerClick, X } from 'lucide-react';
import type { IFCMeshData } from '@/lib/ifc-parser';

interface IFCViewerProps {
  meshes: IFCMeshData[];
}

// --- Helpers ---

function createTextSprite(text: string, color = '#22d3ee', fontSize = 48): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `bold ${fontSize}px monospace`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const pad = 16;
  canvas.width = metrics.width + pad * 2;
  canvas.height = fontSize + pad * 2;

  ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
  const r = 8;
  const w = canvas.width, h = canvas.height;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width / 80, canvas.height / 80, 1);
  return sprite;
}

function createDimensionLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  label: string,
  color: string,
  offsetDir: THREE.Vector3
): THREE.Group {
  const group = new THREE.Group();
  group.userData.isDimension = true;

  const offset = 1.5;
  const s = start.clone().add(offsetDir.clone().multiplyScalar(offset));
  const e = end.clone().add(offsetDir.clone().multiplyScalar(offset));

  // Main line
  const lineGeo = new THREE.BufferGeometry().setFromPoints([s, e]);
  const lineMat = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
  group.add(new THREE.Line(lineGeo, lineMat));

  // Extension lines
  const extLen = 0.8;
  for (const pt of [{ base: start, off: s }, { base: end, off: e }]) {
    const extGeo = new THREE.BufferGeometry().setFromPoints([
      pt.base.clone().add(offsetDir.clone().multiplyScalar(offset - extLen)),
      pt.off.clone().add(offsetDir.clone().multiplyScalar(extLen * 0.3)),
    ]);
    group.add(new THREE.Line(extGeo, lineMat));
  }

  // Label
  const mid = s.clone().add(e).multiplyScalar(0.5).add(offsetDir.clone().multiplyScalar(0.5));
  const sprite = createTextSprite(label, color);
  sprite.position.copy(mid);
  group.add(sprite);

  return group;
}

function createMeasurementLine(p1: THREE.Vector3, p2: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.userData.isMeasurement = true;

  const dist = p1.distanceTo(p2);
  const label = `${dist.toFixed(2)} m`;

  // Line
  const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 2, depthTest: false });
  group.add(new THREE.Line(geo, mat));

  // End spheres
  for (const pt of [p1, p2]) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false })
    );
    sphere.position.copy(pt);
    group.add(sphere);
  }

  // Label at midpoint
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  mid.y += 0.5;
  const sprite = createTextSprite(label, '#fbbf24', 42);
  sprite.position.copy(mid);
  group.add(sprite);

  return group;
}

// --- Component ---

type MeasureMode = 'none' | 'picking';

const IFCViewer = ({ meshes }: IFCViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<{
    rotX: number; rotY: number; distance: number; target: THREE.Vector3;
    updateCamera: () => void;
  } | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none');
  const measurePointRef = useRef<THREE.Vector3 | null>(null);
  const measurePreviewRef = useRef<THREE.Group | null>(null);

  // Cleanup measurement previews
  const clearMeasurements = useCallback(() => {
    if (!sceneRef.current) return;
    const toRemove = sceneRef.current.children.filter(c => c.userData.isMeasurement);
    toRemove.forEach(c => sceneRef.current!.remove(c));
    measurePointRef.current = null;
    if (measurePreviewRef.current) {
      sceneRef.current.remove(measurePreviewRef.current);
      measurePreviewRef.current = null;
    }
  }, []);

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

  // Handle measurement clicks
  useEffect(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (measureMode !== 'picking') return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const raycaster = new THREE.Raycaster();

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);

      // Only intersect mesh group
      const targets = meshGroupRef.current ? meshGroupRef.current.children : [];
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length === 0) return;

      const point = hits[0].point.clone();

      if (!measurePointRef.current) {
        // First point - add preview sphere
        measurePointRef.current = point;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false })
        );
        sphere.position.copy(point);
        const previewGroup = new THREE.Group();
        previewGroup.userData.isMeasurement = true;
        previewGroup.add(sphere);
        scene.add(previewGroup);
        measurePreviewRef.current = previewGroup;
      } else {
        // Second point - create measurement
        if (measurePreviewRef.current) {
          scene.remove(measurePreviewRef.current);
          measurePreviewRef.current = null;
        }
        const line = createMeasurementLine(measurePointRef.current, point);
        scene.add(line);
        measurePointRef.current = null;
      }
    };

    renderer.domElement.addEventListener('click', onClick);
    return () => renderer.domElement.removeEventListener('click', onClick);
  }, [measureMode]);

  // Add meshes and dimension overlays when they change
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !isReady) return;
    const scene = sceneRef.current;

    // Remove old mesh groups and dimensions
    const toRemove = scene.children.filter(
      c => c.type === 'Group' || c.type === 'Mesh'
    );
    toRemove.forEach(m => scene.remove(m));
    meshGroupRef.current = null;

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
    meshGroupRef.current = group;
    box.setFromObject(group);

    // Add bounding box dimensions
    if (showDimensions) {
      const min = box.min;
      const max = box.max;
      const sizeVec = box.getSize(new THREE.Vector3());

      // Width (X-axis) - bottom front edge
      const widthLine = createDimensionLine(
        new THREE.Vector3(min.x, min.y, max.z),
        new THREE.Vector3(max.x, min.y, max.z),
        `${sizeVec.x.toFixed(2)} m`,
        '#22d3ee',
        new THREE.Vector3(0, 0, 1)
      );
      scene.add(widthLine);

      // Height (Y-axis) - front right edge
      const heightLine = createDimensionLine(
        new THREE.Vector3(max.x, min.y, max.z),
        new THREE.Vector3(max.x, max.y, max.z),
        `${sizeVec.y.toFixed(2)} m`,
        '#a78bfa',
        new THREE.Vector3(1, 0, 1).normalize()
      );
      scene.add(heightLine);

      // Depth (Z-axis) - bottom right edge
      const depthLine = createDimensionLine(
        new THREE.Vector3(max.x, min.y, min.z),
        new THREE.Vector3(max.x, min.y, max.z),
        `${sizeVec.z.toFixed(2)} m`,
        '#34d399',
        new THREE.Vector3(1, 0, 0)
      );
      scene.add(depthLine);

      // Bounding box wireframe
      const boxHelper = new THREE.Box3Helper(box, new THREE.Color(0x334155));
      scene.add(boxHelper);
    }

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
  }, [meshes, isReady, showDimensions]);

  return (
    <div className="viewer-container relative w-full h-full min-h-[400px]">
      <div
        ref={containerRef}
        className={`w-full h-full min-h-[400px] ${measureMode === 'picking' ? 'cursor-crosshair' : ''}`}
      />
      {meshes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
          <Box size={48} className="opacity-20 mb-3" />
          <p className="text-sm opacity-50">3D Preview</p>
          <p className="text-xs opacity-30">Upload an IFC file to render</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        <button
          onClick={() => setShowDimensions(d => !d)}
          className={`p-2 rounded-md backdrop-blur border text-xs transition-colors ${
            showDimensions
              ? 'bg-primary/20 border-primary/40 text-primary'
              : 'bg-card/80 border-border text-muted-foreground hover:text-foreground'
          }`}
          title="Toggle bounding box dimensions"
        >
          <Ruler size={16} />
        </button>
        <button
          onClick={() => {
            if (measureMode === 'picking') {
              setMeasureMode('none');
              measurePointRef.current = null;
            } else {
              setMeasureMode('picking');
            }
          }}
          className={`p-2 rounded-md backdrop-blur border text-xs transition-colors ${
            measureMode === 'picking'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-card/80 border-border text-muted-foreground hover:text-foreground'
          }`}
          title="Measure distance between two points"
        >
          <MousePointerClick size={16} />
        </button>
        {measureMode === 'none' && (
          <button
            onClick={clearMeasurements}
            className="p-2 rounded-md backdrop-blur bg-card/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Clear measurements"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Measure mode indicator */}
      {measureMode === 'picking' && (
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-amber-500/20 backdrop-blur border border-amber-500/40 text-xs text-amber-400 font-medium">
          {measurePointRef.current ? 'Click second point' : 'Click first point on model'}
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
