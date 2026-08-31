import { useRef, useState, useEffect } from 'react';

export default function SignaturePad({ onCapture }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1f2a24';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  }
  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onCapture(null);
  }

  function capture() {
    canvasRef.current.toBlob((blob) => onCapture(blob), 'image/png');
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={420}
        height={140}
        style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button type="button" className="btn secondary" onClick={clear}>
          Clear
        </button>
        <button type="button" className="btn" disabled={!hasStroke} onClick={capture}>
          Use this signature
        </button>
      </div>
    </div>
  );
}
