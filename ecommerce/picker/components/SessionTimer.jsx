import React, { useState, useEffect } from "react";
import { FaClock } from "react-icons/fa";

export const SessionTimer = ({ startDate }) => {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!startDate) return;
    const interval = setInterval(() => {
      const start = new Date(startDate).getTime();
      const now = new Date().getTime();
      const diff = now - start;
      if (diff < 0) return;
      
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      
      setElapsed(
        `${hours > 0 ? hours + ":" : ""}${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startDate]);

  return (
    <div className="ec-timer-badge">
      <FaClock /> {elapsed}
    </div>
  );
};