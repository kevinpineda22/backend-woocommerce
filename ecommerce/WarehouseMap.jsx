import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRedo } from "react-icons/fa";
import "./WarehouseMap.css";

// CONFIGURACIÓN DE LA BODEGA (Simulada - Esto podría venir de BD)
// Asumimos una grilla simple de pasillos.
const GRID_COLS = 5; // Cantidad de pasillos por fila
const AISLE_WIDTH = 80; // Ancho visual en px
const AISLE_HEIGHT = 140; // Alto visual en px (incluye espacio)
const PADDING = 40; // Margen

const WarehouseMap = ({ routeData = [] }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 2x, etc.

  // 1. Generar coordenadas para "todos" los pasillos posibles (del 1 al 20 por ejemplo)
  // O mejor: Generar dinámicamente las coordenadas basadas en los pasillos que aparecen en la ruta + algunos extra
  const mapLayout = useMemo(() => {
    // Extraer pasillos únicos de la ruta
    const uniqueAisles = [...new Set(routeData.map(r => r.pasillo))].filter(p => p !== "S/N" && p !== "Otros");
    // Ordenarlos numéricamente
    uniqueAisles.sort((a, b) => parseInt(a) - parseInt(b));

    // Si no hay pasillos, simulamos del 1 al 10 para mostrar algo
    const aislesToShow = uniqueAisles.length > 0 ? uniqueAisles : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    
    // Crear mapa de posiciones { "1": {x: 50, y: 50}, ... }
    const positions = {};
    aislesToShow.forEach((aisle, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      
      positions[aisle] = {
        x: PADDING + (col * (AISLE_WIDTH + 40)),
        y: PADDING + (row * (AISLE_HEIGHT + 40)),
        label: aisle
      };
    });

    // Añadir posiciones especiales
    positions["S/N"] = { x: PADDING, y: PADDING + 300, label: "Mesa/General" };
    positions["Otros"] = { x: PADDING + 120, y: PADDING + 300, label: "Otros" };

    return positions;
  }, [routeData]);

  // 2. Filtrar ruta válida (solo logs que tienen pasillo mapeado o S/N)
  const validPath = useMemo(() => {
    return routeData.map((step, idx) => {
      const pos = mapLayout[step.pasillo] || mapLayout["S/N"];
      return { ...step, x: pos.x + 30, y: pos.y + 60, id: idx }; // Centro del pasillo
    });
  }, [routeData, mapLayout]);

  // 3. Control de Animación
  useEffect(() => {
    let interval;
    if (isPlaying && currentStepIndex < validPath.length - 1) {
      interval = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev >= validPath.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / speed); // Velocidad ajustable
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentStepIndex, validPath, speed]);

  // Posición actual del Picker (si no hay ruta, posición 0)
  const currentPos = validPath[currentStepIndex] || { x: 50, y: 50 };

  if (!routeData || routeData.length === 0) {
    return <div className="warehouse-map-container"><p>No hay datos de ruta disponibles para visualizar.</p></div>;
  }

  return (
    <div className="warehouse-map-container">
      <div className="map-header">
        <h4>🗺️ Reproducción de Ruta (Picking Playback)</h4>
      </div>

      <div className="map-viewport">
        {/* DIBUJAR PASILLOS (NODOS) */}
        {Object.entries(mapLayout).map(([key, pos]) => (
          <div
            key={key}
            className={`aisle-rect ${key === validPath[currentStepIndex]?.pasillo ? "active" : ""}`}
            style={{ left: pos.x, top: pos.y }}
          >
           P-{pos.label}
          </div>
        ))}

        {/* DIBUJAR LÍNEAS DE RUTA (SVG) */}
        <svg className="path-svg">
           <polyline
             points={validPath.map(p => `${p.x},${p.y}`).join(" ")}
             fill="none"
             stroke="rgba(59, 130, 246, 0.3)"
             strokeWidth="4"
             strokeDasharray="10, 5"
           />
           {/* Línea de progreso recorrida */}
           <polyline
             points={validPath.slice(0, currentStepIndex + 1).map(p => `${p.x},${p.y}`).join(" ")}
             fill="none"
             stroke="#3b82f6"
             strokeWidth="4"
           />
        </svg>

        {/* PICKER AVATAR (ANIMADO) */}
        <motion.div
          className="picker-avatar"
          animate={{ x: currentPos.x - 15, y: currentPos.y - 15 }} // -15 para centrar (w/2)
          transition={{ type: "spring", stiffness: 60, damping: 15 }}
        >
          👷
        </motion.div>
      </div>

      {/* CONTROLES */}
      <div className="map-controls">
        <button className="map-btn" onClick={() => setCurrentStepIndex(0)}><FaRedo /></button>
        <button className="map-btn" onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}><FaStepBackward /></button>
        
        <button className="map-btn primary" onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <><FaPause /> Pausa</> : <><FaPlay /> Play</>}
        </button>

        <button className="map-btn" onClick={() => setCurrentStepIndex(Math.min(validPath.length - 1, currentStepIndex + 1))}><FaStepForward /></button>
        
        <select className="map-btn" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>

        <div className="step-info">
          Paso: {currentStepIndex + 1} / {validPath.length}<br/>
          <small>{validPath[currentStepIndex]?.nombre_producto?.substring(0, 15)}...</small>
        </div>
      </div>
    </div>
  );
};

export default WarehouseMap;
