import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRedo } from "react-icons/fa";
import "./WarehouseMap.css";

// CONFIGURACIÓN DE LA BODEGA (Basado en esquema del usuario)
// Ajuste: Más separacion P-13 Top. Pasillos mas abajo.
const LAYOUT_CONFIG = [
  // Columna 1 (x: 40 -> 140)
  // Bloque principal movido a y: 100
  { id: "1", x: 40, y: 100, label: "1", type: "standard", width: 100 },
  { id: "2", x: 40, y: 270, label: "2", type: "standard", width: 100 },
  
  // Columna 2 (x: 150 -> 250)
  { id: "3", x: 150, y: 100, label: "3", type: "standard", width: 100 },
  { id: "4", x: 150, y: 270, label: "4", type: "standard", width: 100 },

  // Columna 3 (x: 260 -> 360)
  { id: "5", x: 260, y: 100, label: "5", type: "standard", width: 100 },
  { id: "6", x: 260, y: 270, label: "6", type: "standard", width: 100 },

  // Columna 4 (x: 370 -> 470)
  { id: "7", x: 370, y: 100, label: "7", type: "standard", width: 100 },
  { id: "8", x: 370, y: 270, label: "8", type: "standard", width: 100 },

  // Columna 5 (x: 480 -> 580)
  { id: "9", x: 480, y: 100, label: "9", type: "standard", width: 100 },
  { id: "10", x: 480, y: 270, label: "10", type: "standard", width: 100 },

  // Columna 6 (x: 590 -> 690)
  { id: "11", x: 590, y: 100, label: "11", type: "standard", width: 100 },
  { id: "12", x: 590, y: 270, label: "12", type: "standard", width: 100 },

  // Pasillo 13 (Vertical a la derecha)
  // Alineado con el nuevo inicio de bloques y: 100
  { id: "13", x: 700, y: 100, label: "13", height: 350, type: "block", width: 60 },
  
  // Pasillo 13 (Extension Superior - Zona de Arriba)
  // Ahora en y: 20 (gap hasta 100 = 80px espacio). h: 40 (ends 60). Gap real de paso: 60->100
  { id: "13_top", x: 40, y: 20, label: "13", width: 720, height: 40, type: "block" },

  // Pasillo 14 (Transversal inferior)
  // y: 490 para dejar gap abajo
  { id: "14", x: 40, y: 490, label: "14", width: 720, height: 60, type: "block" },
];

// ZONAS DE TRANSICIÓN (Pasillos Horizontales Invisibles)
// Donde camina el muñeco para ir de una columna a otra
const TOP_TRANSIT_Y = 80;       // Entre P13_Top (fin 60) y Pasillos_Top (inicio 100) -> Gap 40px, centro 80.
const MIDDLE_TRANSIT_Y = 255;   // Entre Pasillos_Top (fin 240) y Pasillos_Bottom (inicio 270) -> Gap 30px, centro 255.
const BOTTOM_TRANSIT_Y = 450;   // Entre Pasillos_Bottom (fin 410) y P14 (inicio 490) -> Gap 80px, centro 450.

const getWalkingPoint = (pos) => {
  const wx = pos.x + (pos.width / 2);
  const wy = pos.y + (pos.height / 2);
  return { x: wx - 15, y: wy - 15 };
};

// Determina por dónde cruzar basado en Origen y Destino
const getTransitY = (y1, y2) => {
    // Rango de pasillos superiores (aprox y: 100 -> 240)
    const isTop1 = y1 < 240; 
    const isTop2 = y2 < 240;
    
    // Rango de pasillos inferiores (aprox y: 270 -> 410)
    const isBottom1 = y1 > 260; 
    const isBottom2 = y2 > 260;

    // Si ambos son superiores -> Cruce por ARRIBA (Serpiente Top)
    if (isTop1 && isTop2) return TOP_TRANSIT_Y;

    // Si ambos son inferiores -> Cruce por ABAJO (Serpiente Bottom)
    // EXCEPCIÓN: Si alguno es el P-14 (y > 480), usamos el centro del P-14 o BOTTOM_TRANSIT_Y
    if (isBottom1 && isBottom2) return BOTTOM_TRANSIT_Y;

    // Si es mixto (uno arriba, uno abajo) -> Cruce por MEDIO
    return MIDDLE_TRANSIT_Y;
};

// Generador de rutas SVG
const generateOrthogonalPath = (points) => {
  if (points.length < 2) return "";
  const offset = 15; 
  let path = `M ${points[0].x + offset} ${points[0].y + offset}`;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    // Si cambio de columna (X diferente significativamente)
    if (Math.abs(p1.x - p2.x) > 20) {
        const transitY = getTransitY(p1.y, p2.y);
        // Salir Y -> Cruzar X -> Entrar Y
        path += ` L ${p1.x + offset} ${transitY} L ${p2.x + offset} ${transitY} L ${p2.x + offset} ${p2.y + offset}`;
    } else {
        // Movimiento simple (mismo tubo)
        path += ` L ${p1.x + offset} ${p2.y + offset} L ${p2.x + offset} ${p2.y + offset}`;
    }
  }
  return path;
};

const WarehouseMap = ({ routeData = [] }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const mapLayout = useMemo(() => {
    const layout = {};
    LAYOUT_CONFIG.forEach(item => {
      layout[item.id] = { ...item, width: item.width || 80, height: item.height || 140 };
    });
    if (routeData) {
      const uniqueAisles = [...new Set(routeData.map(r => r.pasillo))];
      uniqueAisles.forEach((aisle, i) => {
        if (!layout[aisle] && aisle !== 'Otros' && aisle !== 'S/N') {
            layout[aisle] = { x: 50, y: 500 + (i * 100), label: aisle, isDynamic: true, width: 80, height: 80, type: 'block' };
        }
      });
    }
    return layout;
  }, [routeData]);

  const walkingSteps = useMemo(() => {
    return routeData.map((step, idx) => {
      let layoutItem = mapLayout[step.pasillo];
      if (!layoutItem) layoutItem = { x: 400, y: 460, width: 0, height: 0, isDynamic: true };
      const walkPos = getWalkingPoint(layoutItem);
      return { ...step, x: walkPos.x, y: walkPos.y, id: idx };
    });
  }, [routeData, mapLayout]);

  useEffect(() => {
    let interval;
    if (isPlaying && currentStepIndex < walkingSteps.length - 1) {
      const stepDuration = 2000 / speed;
      interval = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev >= walkingSteps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, stepDuration);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentStepIndex, walkingSteps, speed]);

  const currentPos = walkingSteps[currentStepIndex] || { x: 40, y: 40 };
  const prevPos = currentStepIndex > 0 ? walkingSteps[currentStepIndex - 1] : currentPos;
  
  // ANIMACIÓN INTELIGENTE CON ZONAS DE PASO
  const walkKeyframes = useMemo(() => {
     if (currentStepIndex === 0 && !isPlaying) return { x: currentPos.x, y: currentPos.y };
     
     const changeInX = Math.abs(currentPos.x - prevPos.x) > 20;
     
     if (changeInX) {
        // ELEGIR TRANSICIÓN CORRECTA
        const transitY = getTransitY(prevPos.y, currentPos.y) - 15; // -15 para compensar centro de avatar

        return {
            x: [prevPos.x, prevPos.x, currentPos.x, currentPos.x],
            y: [prevPos.y, transitY, transitY, currentPos.y],
            transition: { times: [0, 0.3, 0.7, 1], ease: "linear", duration: 2 / speed }
        };
     } else {
         return {
             x: [prevPos.x, currentPos.x],
             y: [prevPos.y, currentPos.y],
             transition: { ease: "linear", duration: 2 / speed }
         };
     }
  }, [currentPos, prevPos, currentStepIndex, isPlaying, speed]);

  const svgPathD = useMemo(() => generateOrthogonalPath(walkingSteps), [walkingSteps]);
  const traveledPathD = useMemo(() => generateOrthogonalPath(walkingSteps.slice(0, currentStepIndex + 1)), [walkingSteps, currentStepIndex]);

  if (!routeData || routeData.length === 0) return <div className="warehouse-map-container"><p>No data</p></div>;

  return (
    <div className="warehouse-map-container">
      <div className="map-header">
        <h4>🗺️ Picking Realista (Ruta Serpiente)</h4>
      </div>

      <div className="map-viewport">
        {/* RENDERIZADO DE PASILLOS */}
        {Object.entries(mapLayout).map(([key, pos]) => {
            const currentStepPasillo = walkingSteps[currentStepIndex]?.pasillo;
            const isActive = (key === currentStepPasillo) || (String(pos.label) === String(currentStepPasillo));
            
            if (pos.type === 'standard') {
                return (
                    <div 
                        key={key} 
                        className={`aisle-container ${isActive ? 'active' : ''}`}
                        style={{ left: pos.x, top: pos.y, width: pos.width, height: pos.height }}
                    >
                        <div className="rack"></div>
                        <div className="floor-label">{pos.label}</div>
                        <div className="rack"></div>
                    </div>
                );
            }
            return (
                <div
                    key={key}
                    className={`aisle-rect ${isActive ? "active" : ""}`}
                    style={{ left: pos.x, top: pos.y, width: pos.width, height: pos.height, borderStyle: pos.isDynamic ? 'dashed' : 'solid' }}
                >
                   {pos.isDynamic ? key : `P-${pos.label}`}
                </div>
            );
        })}

        {/* LINEAS DE RUTA */}
        <svg className="path-svg">
           <path d={svgPathD} fill="none" stroke="rgba(59, 130, 246, 0.2)" strokeWidth="4" strokeDasharray="5,5" />
           <path d={traveledPathD} fill="none" stroke="#3b82f6" strokeWidth="3" />
        </svg>

        {/* AVATAR + ALERTAS */}
        <motion.div
          className="picker-avatar"
          animate={walkKeyframes} 
          transition={{ duration: isPlaying ? (2/speed) : 0.5, ease: "linear" }}
        >
          <img src="/icono.ico" alt="Picker" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          <AnimatePresence mode="wait">
            {isPlaying && walkingSteps[currentStepIndex] && (() => {
               const step = walkingSteps[currentStepIndex];
               // Verificación ampliada para soportar estructura de BD (accion: retirado, motivo: Agotado)
               const isRemoved = 
                 step.accion === 'retirado' || 
                 step.motivo === 'Agotado' || 
                 step.removed || 
                 step.not_found || 
                 step.estado === 'no_encontrado' || 
                 step.estado === 'retirado';
               
               return (
                <motion.div 
                  className={`picking-alert ${isRemoved ? 'removed' : ''}`}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.8 }}
                  key={`alert-${currentStepIndex}`}
                >
                  {isRemoved ? '❌' : '📦'} 
                  <strong>{step.nombre_producto?.substring(0, 15)}...</strong>
                </motion.div>
               );
            })()}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="map-controls">
        <button className="map-btn" onClick={() => setCurrentStepIndex(0)}><FaRedo /></button>
        <button className="map-btn" onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}><FaStepBackward /></button>
        <button className="map-btn primary" onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <><FaPause /> Pausa</> : <><FaPlay /> Play</>}
        </button>
        <button className="map-btn" onClick={() => setCurrentStepIndex(Math.min(walkingSteps.length - 1, currentStepIndex + 1))}><FaStepForward /></button>
        <select className="map-btn" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
        <div className="step-info">
          Paso: {currentStepIndex + 1} / {walkingSteps.length}
        </div>
      </div>
    </div>
  );
};

export default WarehouseMap;
