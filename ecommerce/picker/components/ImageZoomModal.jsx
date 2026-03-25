import React, { useEffect } from "react";
import { FaTimes } from "react-icons/fa";
import "./ImageZoomModal.css";

const ImageZoomModal = ({ isOpen, imageSrc, productName, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="ec-zoom-overlay" onClick={onClose}>
      <button className="ec-zoom-close" onClick={onClose}>
        <FaTimes />
      </button>
      <div className="ec-zoom-content" onClick={(e) => e.stopPropagation()}>
        <img src={imageSrc} className="ec-zoom-img" alt={productName || ""} />
        {productName && <p className="ec-zoom-name">{productName}</p>}
      </div>
    </div>
  );
};

export default ImageZoomModal;
