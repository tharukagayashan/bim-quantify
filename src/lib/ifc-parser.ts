import * as WebIFC from 'web-ifc';

export interface IFCElementData {
  id: number;
  type: string;
  name: string;
  area: number | null;
  volume: number | null;
}

export interface IFCStoreyData {
  name: string;
  elevation: number;
  expressID: number;
  elementIDs: number[];
}

export interface IFCBuildingData {
  storeyCount: number;
  storeys: IFCStoreyData[];
  grossFloorArea: number | null;
  totalVolume: number | null;
  perimeter: number | null;
  projectName: string;
  siteName: string;
  buildingName: string;
  elements: IFCElementData[];
}

const ELEMENT_TYPES: { type: number; label: string }[] = [
  { type: WebIFC.IFCWALL, label: 'IfcWall' },
  { type: WebIFC.IFCWALLSTANDARDCASE, label: 'IfcWallStandardCase' },
  { type: WebIFC.IFCSLAB, label: 'IfcSlab' },
  { type: WebIFC.IFCCOLUMN, label: 'IfcColumn' },
  { type: WebIFC.IFCBEAM, label: 'IfcBeam' },
  { type: WebIFC.IFCWINDOW, label: 'IfcWindow' },
  { type: WebIFC.IFCDOOR, label: 'IfcDoor' },
  { type: WebIFC.IFCROOF, label: 'IfcRoof' },
  { type: WebIFC.IFCSTAIR, label: 'IfcStair' },
  { type: WebIFC.IFCRAILING, label: 'IfcRailing' },
  { type: WebIFC.IFCCOVERING, label: 'IfcCovering' },
  { type: WebIFC.IFCPLATE, label: 'IfcPlate' },
  { type: WebIFC.IFCMEMBER, label: 'IfcMember' },
  { type: WebIFC.IFCCURTAINWALL, label: 'IfcCurtainWall' },
  { type: WebIFC.IFCFOOTING, label: 'IfcFooting' },
];

const STRUCTURAL_TYPES = [
  WebIFC.IFCWALL,
  WebIFC.IFCWALLSTANDARDCASE,
  WebIFC.IFCSLAB,
  WebIFC.IFCCOLUMN,
  WebIFC.IFCBEAM,
];

function getPropertyValue(ifcApi: WebIFC.IfcAPI, modelID: number, expressID: number): any {
  try {
    const props = ifcApi.GetLine(modelID, expressID);
    return props;
  } catch {
    return null;
  }
}

function extractQuantityFromPsets(
  ifcApi: WebIFC.IfcAPI,
  modelID: number,
  elementID: number,
  quantityNames: string[]
): number | null {
  try {
    const psets = ifcApi.GetLine(modelID, elementID, true);
    if (!psets) return null;

    // Try to find property sets through IsDefinedBy
    if (psets.IsDefinedBy) {
      for (const rel of psets.IsDefinedBy) {
        if (!rel || !rel.value) continue;
        try {
          const relLine = ifcApi.GetLine(modelID, rel.value, true);
          if (relLine && relLine.RelatingPropertyDefinition) {
            const psetRef = relLine.RelatingPropertyDefinition;
            const pset = typeof psetRef === 'object' && psetRef.value
              ? ifcApi.GetLine(modelID, psetRef.value, true)
              : null;
            if (pset && pset.Quantities) {
              for (const q of pset.Quantities) {
                if (!q || !q.value) continue;
                const quantity = ifcApi.GetLine(modelID, q.value);
                if (quantity && quantity.Name && quantityNames.includes(quantity.Name.value)) {
                  const val = quantity.AreaValue?.value
                    ?? quantity.VolumeValue?.value
                    ?? quantity.LengthValue?.value
                    ?? quantity.NominalValue?.value;
                  if (val != null && typeof val === 'number') return val;
                }
              }
            }
            if (pset && pset.HasProperties) {
              for (const p of pset.HasProperties) {
                if (!p || !p.value) continue;
                const prop = ifcApi.GetLine(modelID, p.value);
                if (prop && prop.Name && quantityNames.includes(prop.Name.value)) {
                  const val = prop.NominalValue?.value;
                  if (val != null && typeof val === 'number') return val;
                }
              }
            }
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function computeBoundingBox(
  ifcApi: WebIFC.IfcAPI,
  modelID: number,
  elementID: number
): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } | null {
  try {
    const flatMesh = ifcApi.GetFlatMesh(modelID, elementID);
    if (!flatMesh || !flatMesh.geometries || flatMesh.geometries.size() === 0) return null;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < flatMesh.geometries.size(); i++) {
      const placedGeom = flatMesh.geometries.get(i);
      const geom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
      const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const matrix = placedGeom.flatTransformation;

      for (let v = 0; v < verts.length; v += 6) {
        const x = verts[v], y = verts[v + 1], z = verts[v + 2];
        // Apply transform
        const tx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const ty = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const tz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];

        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx);
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
        minZ = Math.min(minZ, tz); maxZ = Math.max(maxZ, tz);
      }

      geom.delete();
    }

    if (minX === Infinity) return null;
    return { minX, minY, minZ, maxX, maxY, maxZ };
  } catch {
    return null;
  }
}

export async function parseIFCFile(buffer: ArrayBuffer): Promise<IFCBuildingData> {
  const ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath('/');
  await ifcApi.Init();

  const data = new Uint8Array(buffer);
  const modelID = ifcApi.OpenModel(data);

  // Extract project info
  let projectName = 'Unknown Project';
  let siteName = 'Unknown Site';
  let buildingName = 'Unknown Building';

  try {
    const projects = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projects.size() > 0) {
      const project = ifcApi.GetLine(modelID, projects.get(0));
      projectName = project.Name?.value || project.LongName?.value || projectName;
    }
  } catch { /* ignore */ }

  try {
    const sites = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSITE);
    if (sites.size() > 0) {
      const site = ifcApi.GetLine(modelID, sites.get(0));
      siteName = site.Name?.value || site.LongName?.value || siteName;
    }
  } catch { /* ignore */ }

  try {
    const buildings = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);
    if (buildings.size() > 0) {
      const building = ifcApi.GetLine(modelID, buildings.get(0));
      buildingName = building.Name?.value || building.LongName?.value || buildingName;
    }
  } catch { /* ignore */ }

  // Extract storeys
  const storeys: IFCStoreyData[] = [];
  const elementToStorey = new Map<number, number>(); // elementExpressID -> storeyExpressID
  try {
    const storeyIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
    for (let i = 0; i < storeyIDs.size(); i++) {
      const sid = storeyIDs.get(i);
      const storey = ifcApi.GetLine(modelID, sid);
      storeys.push({
        name: storey.Name?.value || `Storey ${i + 1}`,
        elevation: storey.Elevation?.value ?? 0,
        expressID: sid,
        elementIDs: [],
      });
    }
    storeys.sort((a, b) => a.elevation - b.elevation);

    // Map elements to storeys via IfcRelContainedInSpatialStructure
    try {
      const relIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
      console.log(`[IFC Parser] Found ${relIDs.size()} IfcRelContainedInSpatialStructure relations`);
      for (let i = 0; i < relIDs.size(); i++) {
        try {
          const rel = ifcApi.GetLine(modelID, relIDs.get(i), false);
          const structureRef = rel.RelatingStructure;
          const storeyExpressID = typeof structureRef === 'object' && structureRef?.value != null
            ? structureRef.value
            : (typeof structureRef === 'number' ? structureRef : null);
          
          if (storeyExpressID == null) continue;
          const storeyData = storeys.find(s => s.expressID === storeyExpressID);
          if (!storeyData) continue;

          if (rel.RelatedElements) {
            for (const elRef of rel.RelatedElements) {
              let elID: number | null = null;
              if (typeof elRef === 'object' && elRef?.value != null) {
                elID = elRef.value;
              } else if (typeof elRef === 'number') {
                elID = elRef;
              } else if (typeof elRef === 'object' && elRef?.expressID != null) {
                elID = elRef.expressID;
              }
              if (elID != null) {
                storeyData.elementIDs.push(elID);
                elementToStorey.set(elID, storeyExpressID);
              }
            }
          }
        } catch { continue; }
      }
    } catch { /* ignore */ }

    // Also map via IfcRelAggregates (some elements are aggregated under storeys)
    try {
      const aggIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
      for (let i = 0; i < aggIDs.size(); i++) {
        try {
          const rel = ifcApi.GetLine(modelID, aggIDs.get(i), false);
          const parentRef = rel.RelatingObject;
          const parentID = typeof parentRef === 'object' && parentRef?.value != null
            ? parentRef.value
            : (typeof parentRef === 'number' ? parentRef : null);
          if (parentID == null) continue;
          const storeyData = storeys.find(s => s.expressID === parentID);
          if (!storeyData && !elementToStorey.has(parentID)) continue;
          
          // Get the storey this parent belongs to
          const targetStorey = storeyData || storeys.find(s => s.expressID === elementToStorey.get(parentID));
          if (!targetStorey) continue;

          if (rel.RelatedObjects) {
            for (const objRef of rel.RelatedObjects) {
              let objID: number | null = null;
              if (typeof objRef === 'object' && objRef?.value != null) {
                objID = objRef.value;
              } else if (typeof objRef === 'number') {
                objID = objRef;
              }
              if (objID != null && !elementToStorey.has(objID)) {
                targetStorey.elementIDs.push(objID);
                elementToStorey.set(objID, targetStorey.expressID);
              }
            }
          }
        } catch { continue; }
      }
    } catch { /* ignore */ }

    // Log results
    for (const s of storeys) {
      console.log(`[IFC Parser] Storey "${s.name}" (ID: ${s.expressID}): ${s.elementIDs.length} elements`);
    }
  } catch { /* ignore */ }

  // Extract GFA from IfcSpace or IfcSlab
  let grossFloorArea: number | null = null;
  try {
    const spaceIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSPACE);
    let totalArea = 0;
    let found = false;
    for (let i = 0; i < spaceIDs.size(); i++) {
      const area = extractQuantityFromPsets(ifcApi, modelID, spaceIDs.get(i), [
        'GrossFloorArea', 'NetFloorArea', 'Area', 'GrossArea', 'NetArea'
      ]);
      if (area != null) {
        totalArea += area;
        found = true;
      }
    }
    if (!found) {
      // Fallback: try slabs
      const slabIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSLAB);
      for (let i = 0; i < slabIDs.size(); i++) {
        const area = extractQuantityFromPsets(ifcApi, modelID, slabIDs.get(i), [
          'GrossArea', 'NetArea', 'Area', 'GrossSideArea'
        ]);
        if (area != null) {
          totalArea += area;
          found = true;
        }
      }
    }
    if (!found) {
      // Bounding box fallback
      const slabIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSLAB);
      for (let i = 0; i < slabIDs.size(); i++) {
        const bb = computeBoundingBox(ifcApi, modelID, slabIDs.get(i));
        if (bb) {
          totalArea += (bb.maxX - bb.minX) * (bb.maxY - bb.minY);
          found = true;
        }
      }
    }
    grossFloorArea = found ? Math.round(totalArea * 100) / 100 : null;
  } catch { /* ignore */ }

  // Extract total volume from structural elements
  let totalVolume: number | null = null;
  try {
    let volume = 0;
    let found = false;
    for (const type of STRUCTURAL_TYPES) {
      try {
        const ids = ifcApi.GetLineIDsWithType(modelID, type);
        for (let i = 0; i < ids.size(); i++) {
          const vol = extractQuantityFromPsets(ifcApi, modelID, ids.get(i), [
            'NetVolume', 'GrossVolume', 'Volume'
          ]);
          if (vol != null) {
            volume += vol;
            found = true;
          } else {
            // Bounding box fallback
            const bb = computeBoundingBox(ifcApi, modelID, ids.get(i));
            if (bb) {
              volume += (bb.maxX - bb.minX) * (bb.maxY - bb.minY) * (bb.maxZ - bb.minZ);
              found = true;
            }
          }
        }
      } catch { continue; }
    }
    totalVolume = found ? Math.round(volume * 100) / 100 : null;
  } catch { /* ignore */ }

  // Estimate perimeter from building footprint
  let perimeter: number | null = null;
  try {
    // Try ground floor slab bounding box
    const slabIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSLAB);
    let footprintBB: ReturnType<typeof computeBoundingBox> = null;
    for (let i = 0; i < slabIDs.size(); i++) {
      const bb = computeBoundingBox(ifcApi, modelID, slabIDs.get(i));
      if (bb) {
        if (!footprintBB || bb.minZ < footprintBB.minZ) {
          footprintBB = bb;
        }
      }
    }
    if (footprintBB) {
      const w = footprintBB.maxX - footprintBB.minX;
      const h = footprintBB.maxY - footprintBB.minY;
      perimeter = Math.round((2 * (w + h)) * 100) / 100;
    }
  } catch { /* ignore */ }

  // Extract per-element quantities
  const elements: IFCElementData[] = [];
  for (const { type, label } of ELEMENT_TYPES) {
    try {
      const ids = ifcApi.GetLineIDsWithType(modelID, type);
      for (let i = 0; i < ids.size(); i++) {
        const eid = ids.get(i);
        try {
          const line = ifcApi.GetLine(modelID, eid);
          const name = line?.Name?.value || `${label} #${eid}`;
          const area = extractQuantityFromPsets(ifcApi, modelID, eid, [
            'GrossArea', 'NetArea', 'Area', 'GrossSideArea', 'NetSideArea', 'GrossFloorArea', 'NetFloorArea',
          ]);
          const volume = extractQuantityFromPsets(ifcApi, modelID, eid, [
            'NetVolume', 'GrossVolume', 'Volume',
          ]);
          elements.push({ id: eid, type: label, name, area, volume });
        } catch { /* skip element */ }
      }
    } catch { /* skip type */ }
  }

  ifcApi.CloseModel(modelID);

  return {
    storeyCount: storeys.length,
    storeys,
    grossFloorArea,
    totalVolume,
    perimeter,
    projectName,
    siteName,
    buildingName,
    elements,
  };
}

export interface IFCMeshData {
  expressID: number;
  vertices: Float32Array;
  indices: Uint32Array;
  color: { r: number; g: number; b: number; a: number };
}

export async function extractIFCGeometry(buffer: ArrayBuffer): Promise<IFCMeshData[]> {
  const ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath('/');
  await ifcApi.Init();

  const data = new Uint8Array(buffer);
  const modelID = ifcApi.OpenModel(data);

  const meshes: IFCMeshData[] = [];

  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const meshExpressID = flatMesh.expressID;
    for (let i = 0; i < flatMesh.geometries.size(); i++) {
      const placedGeom = flatMesh.geometries.get(i);
      const geom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
      
      const vertexData = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const indexData = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

      const positions = new Float32Array((vertexData.length / 6) * 3);
      for (let v = 0; v < vertexData.length / 6; v++) {
        const srcIdx = v * 6;
        const matrix = placedGeom.flatTransformation;
        const x = vertexData[srcIdx], y = vertexData[srcIdx + 1], z = vertexData[srcIdx + 2];
        positions[v * 3] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        positions[v * 3 + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        positions[v * 3 + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      }

      meshes.push({
        expressID: meshExpressID,
        vertices: positions,
        indices: new Uint32Array(indexData),
        color: {
          r: placedGeom.color.x,
          g: placedGeom.color.y,
          b: placedGeom.color.z,
          a: placedGeom.color.w,
        },
      });

      geom.delete();
    }
  });

  const uniqueIDs = new Set(meshes.map(m => m.expressID));
  console.log(`[IFC Geometry] Total meshes: ${meshes.length}, unique expressIDs: ${uniqueIDs.size}`);
  console.log(`[IFC Geometry] Sample expressIDs: ${[...uniqueIDs].slice(0, 10).join(', ')}`);

  ifcApi.CloseModel(modelID);

  return meshes;
}
