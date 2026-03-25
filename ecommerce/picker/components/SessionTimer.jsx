import React, { useState, useEffect } from "react";
import { FaClock } from "react-icons/fa";

/**
 * Timer que muestra únicamente el tiempo desde que el picker
 * comenzó a pickear (primer producto escaneado/registrado).
 *
 * - Si pickingStartDate es null → todavía no ha pickeado ningún producto.
 * - Si pickingStartDate tiene valor → muestra el tiempo transcurrido.
 */
export const SessionTimer = ({ pickingStartDate }) => {
  const [elapsed, setElapsed] = useState(null);

  useEffect(() => {
    if (!pickingStartDate) {
      setElapsed(null);
      return;
    }
    const tick = () => {
      const diff =
        new Date().getTime() - new Date(pickingStartDate).getTime();
      if (diff < 0) return;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setElapsed(
        `${hours > 0 ? hours + ":" : ""}${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pickingStartDate]);

  if (!pickingStartDate || elapsed === null) {
    return (
      <div className="ec-timer-badge muted">
        <FaClock /> Esperando primer producto...
      </div>
    );
  }

  return (
    <div className="ec-timer-badge">
      <FaClock /> {elapsed}
    </div>
  );
};