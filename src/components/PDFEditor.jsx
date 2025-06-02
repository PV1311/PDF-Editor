import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = 'https://raw.githubusercontent.com/PV1311/PDF-Editor/refs/heads/main/public/pdfjs/pdf.worker.min.mjs';

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
];

function PDFEditor() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  // Blur state
  const [selectedRects, setSelectedRects] = useState([]);
  const [blurredRects, setBlurredRects] = useState([]);
  const [hoveredBlurIndex, setHoveredBlurIndex] = useState(null);

  // Erase state
  const [eraseMode, setEraseMode] = useState(false);
  const [eraseRects, setEraseRects] = useState([]); // {id, top, left, width, height, page, erased}
  const [drawingErase, setDrawingErase] = useState(false);
  const [eraseStart, setEraseStart] = useState(null);
  const [eraseCurrent, setEraseCurrent] = useState(null);
  const [hoveredEraseId, setHoveredEraseId] = useState(null); // For undo erase hover

  // annotation states
  const [addTextMode, setAddTextMode] = useState(false);
  const [textBoxes, setTextBoxes] = useState([]); // {id, page, top, left, text, color, fontSize, fontFamily, lineHeight}
  const [activeTextBox, setActiveTextBox] = useState(null); // {top, left, text, ...style}

  // drag state
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedBoxId, setDraggedBoxId] = useState(null); // For saved text box drag

  // Text style state for new/edit text
  const [textColor, setTextColor] = useState('#222');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [lineHeight, setLineHeight] = useState(1.2);

  // Canvas refs
  const canvasRef = useRef(null);
  const pdfWrapperRef = useRef(null);
  const pageRef = useRef(null);

  // Store PDF page dimensions
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 });

  // --- Drag helpers for distinguishing click vs drag ---
  // const dragTimeout = useRef(null);
  // const [dragStarted, setDragStarted] = useState(false);

  const dragStartPos = useRef(null);


  // When PDF page is rendered, get its dimensions
  const onPageRenderSuccess = useCallback(() => {
    setTimeout(() => {
      const pageCanvas = pdfWrapperRef.current?.querySelector('canvas');
      if (pageCanvas) {
        setPageDims({
          width: pageCanvas.width / window.devicePixelRatio,
          height: pageCanvas.height / window.devicePixelRatio,
        });
      }
    }, 0);
  }, []);

  // Draw overlays on canvas (no blur overlays here anymore)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pageDims.width || !pageDims.height) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw erase overlays (confirmed)
    eraseRects
      .filter(rect => rect.page === pageNumber && rect.erased)
      .forEach(rect => {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
        ctx.restore();
      });

    // Draw erase overlays (pending)
    eraseRects
      .filter(rect => rect.page === pageNumber && !rect.erased)
      .forEach(rect => {
        ctx.save();
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
        ctx.restore();
      });

    // Draw drawing erase rectangle
    if (eraseMode && drawingErase && eraseStart && eraseCurrent) {
      ctx.save();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const left = Math.min(eraseStart.x, eraseCurrent.x);
      const top = Math.min(eraseStart.y, eraseCurrent.y);
      const width = Math.abs(eraseCurrent.x - eraseStart.x);
      const height = Math.abs(eraseCurrent.y - eraseStart.y);
      ctx.strokeRect(left, top, width, height);
      ctx.restore();
    }

    // Draw selection overlays
    selectedRects
      .filter(rect => rect.page === pageNumber)
      .forEach(rect => {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = 'rgba(180,180,255,1)';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
        ctx.restore();
      });
  }, [
    blurredRects, // still needed for rerender
    eraseRects,
    eraseMode,
    drawingErase,
    eraseStart,
    eraseCurrent,
    selectedRects,
    pageNumber,
    pageDims,
  ]);

  function handleFileChange(event) {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.type !== "application/pdf") {
        alert("Please upload a valid PDF file.");
        return;
      }
      setPdfFile(URL.createObjectURL(file));
      setNumPages(null);
      setPageNumber(1);
      setSelectedRects([]);
      setBlurredRects([]);
      setEraseRects([]);
      setEraseMode(false);
    } catch (err) {
      alert("Failed to load file. - " + (err?.message || err));
    }
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(1);
    setSelectedRects([]);
    setBlurredRects([]);
    setEraseRects([]);
    setEraseMode(false);
  }

  function handlePrevPage() {
    setSelectedRects([]);
    setPageNumber(prev => (prev - 1 <= 1 ? 1 : prev - 1));
  }

  function handleNextPage() {
    setSelectedRects([]);
    setPageNumber(prev => (prev + 1 >= numPages ? numPages : prev + 1));
  }

  function getRelativeToCanvas(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top)
    };
  }

  // --- Wrap handleTextSelection in useCallback ---
  const handleTextSelection = useCallback(() => {
    if (eraseMode) return;
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!range || selection.toString().length === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).map(rect => ({
        top: rect.top - canvasRect.top,
        left: rect.left - canvasRect.left,
        width: rect.width,
        height: rect.height,
        page: pageNumber,
        text: selection.toString()
      }));
      setSelectedRects(rects);
    } catch (err) {
      alert("Failed to get selection." + (err?.message || err));
    }
  }, [eraseMode, pageNumber]);

  function handleBlur() {
    if (eraseRects.some(rect => rect.page === pageNumber && !rect.erased)) {
      setEraseRects(prev => prev.filter(rect => rect.page !== pageNumber || rect.erased));
      setDrawingErase(false);
      setEraseStart(null);
      setEraseCurrent(null);
      setEraseMode(false);
      alert('Please finish or cancel the erase action before blurring.');
      return;
    }
    if (!selectedRects || selectedRects.length === 0) {
      alert('Please select some text first to blur');
      return;
    }
    setBlurredRects(prev => [...prev, ...selectedRects]);
    setSelectedRects([]);
    try {
      window.getSelection().removeAllRanges();
    } catch (err) {
      alert('Failed to clear selection: ' + (err?.message || err));
    }
  }

  function handleUnblur(index) {
    setBlurredRects(prev => prev.filter((_, i) => i !== index));
    setHoveredBlurIndex(null);
  }

  // --- ERASE MODE LOGIC ---

  function handleEraseButton() {
    setEraseMode(mode => !mode);
    setDrawingErase(false);
    setEraseStart(null);
    setEraseCurrent(null);
    setEraseRects(prev => prev.filter(rect => rect.erased));
    setSelectedRects([]);
    try {
      window.getSelection().removeAllRanges();
    } catch (err) {
      alert('Failed to clear selection: ' + (err?.message || err));
    }
  }

  function handleCanvasMouseDown(e) {
    if (!eraseMode) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = getRelativeToCanvas(e);
    setEraseRects(prev => prev.filter(rect => rect.erased));
    setDrawingErase(true);
    setEraseStart(pos);
    setEraseCurrent(pos);
  }

  function handleCanvasMouseMove(e) {
    if (!eraseMode || !drawingErase) return;
    const pos = getRelativeToCanvas(e);
    setEraseCurrent(pos);
  }

  function handleCanvasMouseUp(e) {
    if (!eraseMode || !drawingErase) return;
    const start = eraseStart;
    const end = getRelativeToCanvas(e);
    if (!start || !end) {
      setDrawingErase(false);
      setEraseStart(null);
      setEraseCurrent(null);
      return;
    }
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 5 || height < 5) {
      setDrawingErase(false);
      setEraseStart(null);
      setEraseCurrent(null);
      return;
    }
    const newId = Date.now() + Math.random();
    setEraseRects(prev => [
      ...prev,
      {
        id: newId,
        top,
        left,
        width,
        height,
        page: pageNumber,
        erased: false
      }
    ]);
    setDrawingErase(false);
    setEraseStart(null);
    setEraseCurrent(null);
  }

  function handleEraseArea(id) {
    setEraseRects(prev =>
      prev.map(rect =>
        rect.id === id ? { ...rect, erased: true } : rect
      )
    );
    setEraseMode(false);
  }

  function handleEraseAreaRemove(id) {
    setEraseRects(prev => prev.filter(rect => rect.id !== id));
    setDrawingErase(false);
    setEraseStart(null);
    setEraseCurrent(null);
    setEraseMode(false);
  }

  // Undo Erase Overlay
  function UndoEraseButtonsOverlay() {
    return eraseRects
      .filter(rect => rect.page === pageNumber && rect.erased)
      .map(rect => (
        <div
          key={`undo-erase-btns-${rect.id}`}
          style={{
            position: 'absolute',
            top: rect.top - 24,
            left: rect.left,
            zIndex: 10005,
            pointerEvents: 'auto',
            width: rect.width,
            height: rect.height + 24,
            border: hoveredEraseId === rect.id ? '2px solid #f87171' : '2px solid transparent',
            borderRadius: 2,
            transition: 'border 0.2s',
          }}
          onMouseEnter={() => setHoveredEraseId(rect.id)}
          onMouseLeave={() => setHoveredEraseId(null)}
        >
          {hoveredEraseId === rect.id && (
            <button
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                background: '#f87171',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '12px',
                cursor: 'pointer',
                zIndex: 10006,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                pointerEvents: 'auto'
              }}
              onClick={e => {
                e.stopPropagation();
                setEraseRects(prev =>
                  prev.filter(r => r.id !== rect.id)
                );
                setHoveredEraseId(null);
              }}
            >
              Undo Erase
            </button>
          )}
        </div>
      ));
  }

  // Clean up overlays if page changes or PDF changes
  useEffect(() => {
    setSelectedRects([]);
    setDrawingErase(false);
    setEraseStart(null);
    setEraseCurrent(null);
  }, [pageNumber, pdfFile]);

  // Handle canvas events for erase mode
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (eraseMode) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [eraseMode, pageDims]);

  // --- Global drag event listeners ---
  // const handleMouseMove = useCallback((e) => {
  //   if (!dragging) return;
  //   if (activeTextBox && draggedBoxId === null) {
  //     setActiveTextBox(box => ({
  //       ...box,
  //       left: e.clientX - dragOffset.x,
  //       top: e.clientY - dragOffset.y,
  //     }));
  //   } else if (draggedBoxId !== null) {
  //     setTextBoxes(prev =>
  //       prev.map(box =>
  //         box.id === draggedBoxId
  //           ? {
  //               ...box,
  //               left: e.clientX - dragOffset.x,
  //               top: e.clientY - dragOffset.y,
  //             }
  //           : box
  //       )
  //     );
  //   }
  // }, [dragging, activeTextBox, draggedBoxId, dragOffset.x, dragOffset.y]);

  // const handleMouseUp = useCallback(() => {
  //   setDragging(false);
  //   setDraggedBoxId(null);
  // }, []);

  // useEffect(() => {
  //   if (!dragging) return;
  //   window.addEventListener('mousemove', handleMouseMove);
  //   window.addEventListener('mouseup', handleMouseUp);
  //   return () => {
  //     window.removeEventListener('mousemove', handleMouseMove);
  //     window.removeEventListener('mouseup', handleMouseUp);
  //   };
  // }, [dragging, handleMouseMove, handleMouseUp]);



useEffect(() => {
  function handleMouseMove(e) {
    if (dragStartPos.current && draggedBoxId !== null) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 4) {
        setDragging(true);
      }
    }

    if (!dragging) return;

    if (draggedBoxId !== null) {
      setTextBoxes(prev =>
        prev.map(box =>
          box.id === draggedBoxId
            ? {
                ...box,
                left: e.clientX - dragOffset.x,
                top: e.clientY - dragOffset.y,
              }
            : box
        )
      );
    } else if (activeTextBox && draggedBoxId === null) {
      setActiveTextBox(box => ({
        ...box,
        left: e.clientX - dragOffset.x,
        top: e.clientY - dragOffset.y,
      }));
    }
  }

  function handleMouseUp() {
    setDragging(false);
    setDraggedBoxId(null);
    dragStartPos.current = null;
  }

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  return () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
}, [dragging, draggedBoxId, dragOffset, activeTextBox]);


  // Attach text selection handler to the text layer only
  useEffect(() => {
    const wrapper = pdfWrapperRef.current;
    if (!wrapper) return;
    const textLayer = wrapper.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return;
    textLayer.addEventListener('mouseup', handleTextSelection);
    return () => {
      textLayer.removeEventListener('mouseup', handleTextSelection);
    };
  }, [pageNumber, pageDims, eraseMode, handleTextSelection]);

  // Overlay buttons for erase rectangles (pending)
  function EraseButtonsOverlay() {
    if (!eraseMode) return null;
    return eraseRects
      .filter(rect => rect.page === pageNumber && !rect.erased)
      .map(rect => (
        <div
          key={`erase-btns-${rect.id}`}
          style={{
            position: 'absolute',
            top: rect.top - 28,
            left: rect.left,
            zIndex: 10001,
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            style={{
              background: '#f87171',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
            onClick={e => {
              e.stopPropagation();
              handleEraseArea(rect.id);
              setEraseMode(false);
            }}
          >
            Erase
          </button>
          <button
            style={{
              background: '#888',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
            onClick={e => {
              e.stopPropagation();
              handleEraseAreaRemove(rect.id);
            }}
          >
            Cancel
          </button>
        </div>
      ));
  }

  // Overlay buttons for blur rectangles (Unblur)
  function BlurButtonsOverlay() {
    return blurredRects
      .filter(rect => rect.page === pageNumber)
      .map((rect, idx) => {
        const globalIndex = blurredRects.findIndex(
          (r, i) =>
            r.page === pageNumber &&
            r.top === rect.top &&
            r.left === rect.left &&
            r.width === rect.width &&
            r.height === rect.height &&
            i >= idx
        );
        const isHovered = hoveredBlurIndex === globalIndex;
        return (
          <div
            key={`blur-btns-${idx}`}
            style={{
              position: 'absolute',
              top: rect.top - 28,
              left: rect.left,
              width: rect.width,
              height: rect.height + 28,
              zIndex: 10002,
              pointerEvents: 'auto',
              border: isHovered ? '2px solid #a78bfa' : '2px solid transparent',
              borderRadius: 2,
              transition: 'border 0.2s',
            }}
            onMouseEnter={() => setHoveredBlurIndex(globalIndex)}
            onMouseLeave={() => setHoveredBlurIndex(null)}
          >
            {isHovered && (
              <button
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  background: '#a78bfa',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  zIndex: 10003,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  pointerEvents: 'auto'
                }}
                onClick={e => {
                  e.stopPropagation();
                  handleUnblur(globalIndex);
                }}
              >
                Unblur
              </button>
            )}
          </div>
        );
      });
  }

  // --- Text Style Toolbar ---
  function TextStyleToolbar() {
    const [editing, setEditing] = useState(null); // 'fontSize' | 'lineHeight' | null
    const fontSizeRef = useRef(null);
    const lineHeightRef = useRef(null);
    const toolbarRef = useRef(null);

    // Trap focus in input until Enter or outside click
    useEffect(() => {
      function handleDocumentClick(e) {
        if (
          editing === 'fontSize' &&
          fontSizeRef.current &&
          !fontSizeRef.current.contains(e.target)
        ) {
          setEditing(null);
        }
        if (
          editing === 'lineHeight' &&
          lineHeightRef.current &&
          !lineHeightRef.current.contains(e.target)
        ) {
          setEditing(null);
        }
      }
      if (editing) {
        document.addEventListener('mousedown', handleDocumentClick);
      }
      return () => {
        document.removeEventListener('mousedown', handleDocumentClick);
      };
    }, [editing]);

    function handleInputKeyDown(e) {
      if (e.key === 'Enter') {
        setEditing(null);
        e.target.blur();
      }
    }

    return (
      <div className="flex gap-4 items-center" ref={toolbarRef}>
        <label className="flex items-center gap-1">
          <span style={{ fontSize: 13 }}>Color:</span>
          <input
            type="color"
            value={textColor}
            onChange={e => setTextColor(e.target.value)}
            style={{ width: 28, height: 28, border: 'none', background: 'none', padding: 0 }}
          />
        </label>
        <label className="flex items-center gap-1">
          <span style={{ fontSize: 13 }}>Font Size:</span>
          <input
            ref={fontSizeRef}
            type="number"
            min={8}
            max={72}
            value={fontSize === '' ? '' : fontSize}
            onChange={e => {
              const val = e.target.value;
              if (val === '') {
                setFontSize('');
              } else {
                const num = Number(val);
                if (!isNaN(num)) setFontSize(num);
              }
            }}
            style={{ width: 48 }}
            onFocus={() => setEditing('fontSize')}
            onBlur={e => {
              // Only blur if editing is null (set by outside click or Enter)
              if (editing !== 'fontSize') e.preventDefault();
            }}
            onKeyDown={handleInputKeyDown}
            tabIndex={0}
          />
        </label>
        <label className="flex items-center gap-1">
          <span style={{ fontSize: 13 }}>Line Height:</span>
          <input
            ref={lineHeightRef}
            type="number"
            min={1}
            max={3}
            step={0.1}
            value={lineHeight === '' ? '' : lineHeight}
            onChange={e => {
              const val = e.target.value;
              if (val === '') {
                setLineHeight('');
              } else {
                const num = Number(val);
                if (!isNaN(num)) setLineHeight(num);
              }
            }}
            style={{ width: 48 }}
            onFocus={() => setEditing('lineHeight')}
            onBlur={e => {
              if (editing !== 'lineHeight') e.preventDefault();
            }}
            onKeyDown={handleInputKeyDown}
            tabIndex={0}
          />
        </label>
        <label className="flex items-center gap-1">
          <span style={{ fontSize: 13 }}>Font:</span>
          <select
            value={fontFamily}
            onChange={e => setFontFamily(e.target.value)}
            style={{ minWidth: 120 }}
          >
            {FONT_OPTIONS.map(opt => (
              <option key={opt.label} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  // Add Text: handle click on PDF to place text box
  function handlePdfClick(e) {
    if (!addTextMode || activeTextBox) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setActiveTextBox({
      top: y,
      left: x,
      text: '',
      color: textColor,
      fontSize,
      fontFamily,
      lineHeight,
    });
  }

  // --- Save, Cancel, Delete for active text box ---
  function handleSaveTextBox() {
    if (!activeTextBox || !activeTextBox.text.trim()) {
      setActiveTextBox(null);
      setAddTextMode(false);
      return;
    }
    if (activeTextBox.editMode && activeTextBox.id) {
      // Editing existing
      setTextBoxes(prev =>
        prev.map(box =>
          box.id === activeTextBox.id
            ? {
                ...box,
                top: activeTextBox.top,
                left: activeTextBox.left,
                text: activeTextBox.text,
                color: textColor,
                fontSize,
                fontFamily,
                lineHeight,
              }
            : box
        )
      );
    } else {
      // New
      setTextBoxes(prev => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          page: pageNumber,
          top: activeTextBox.top,
          left: activeTextBox.left,
          text: activeTextBox.text,
          color: textColor,
          fontSize,
          fontFamily,
          lineHeight,
        },
      ]);
    }
    setActiveTextBox(null);
    setAddTextMode(false);
  }

  function handleCancelTextBox() {
    setActiveTextBox(null);
    setAddTextMode(false);
  }

  function handleDeleteTextBox() {
    if (activeTextBox && activeTextBox.id) {
      setTextBoxes(prev => prev.filter(box => box.id !== activeTextBox.id));
    }
    setActiveTextBox(null);
    setAddTextMode(false);
  }

  function handleTextBoxMouseDown(e) {
    // Only left mouse button
    if (e.button !== 0) return;
    e.stopPropagation();
    setDragging(true);
    setDragOffset({
      x: e.clientX - activeTextBox.left,
      y: e.clientY - activeTextBox.top,
    });
    setDraggedBoxId(null); // Not dragging a saved box
  }

  // --- Drag/click logic for saved text boxes ---
  function handleSavedBoxMouseDown(e, box) {
  if (e.button !== 0) return;
  e.stopPropagation();
  dragStartPos.current = { x: e.clientX, y: e.clientY };
  setDragOffset({
    x: e.clientX - box.left,
    y: e.clientY - box.top,
  });
  setDraggedBoxId(box.id);
}


  function handleSavedBoxMouseUp() {
  // clearTimeout(dragTimeout.current);
  setDragging(false);
}


  function handleSavedBoxClick(e, box) {
    e.stopPropagation();
    setActiveTextBox({
      id: box.id,
      top: box.top,
      left: box.left,
      text: box.text,
      page: box.page,
      editMode: true, // flag for edit mode
      color: box.color || '#222',
      fontSize: box.fontSize || 16,
      fontFamily: box.fontFamily || 'Arial, sans-serif',
      lineHeight: box.lineHeight || 1.2,
    });
    setTextColor(box.color || '#222');
    setFontSize(box.fontSize || 16);
    setFontFamily(box.fontFamily || 'Arial, sans-serif');
    setLineHeight(box.lineHeight || 1.2);
    setAddTextMode(true);
  }

  // Reset style controls when closing text box
  useEffect(() => {
    if (!addTextMode && !activeTextBox) {
      setTextColor('#222');
      setFontSize(16);
      setFontFamily('Arial, sans-serif');
      setLineHeight(1.2);
    }
  }, [addTextMode, activeTextBox]);

  // --- Save and Download PDF ---
  async function handleSaveAndDownload() {
    if (!pdfFile) return;
    try {
      const existingPdfBytes = await fetch(pdfFile).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const renderedCanvas = pdfWrapperRef.current?.querySelector('canvas');
      const displayWidth = renderedCanvas?.width ?? pageDims.width;
      const displayHeight = renderedCanvas?.height ?? pageDims.height;
      const cssPixelHeight = displayHeight / window.devicePixelRatio;
      const cssPixelWidth = displayWidth / window.devicePixelRatio;

      const firstPage = pdfDoc.getPage(0);
      const pdfPageWidth = firstPage.getWidth();
      const pdfPageHeight = firstPage.getHeight();

      const scaleX = pdfPageWidth / cssPixelWidth;
      const scaleY = pdfPageHeight / cssPixelHeight;

      for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const pageIdx = i + 1;
        const page = pdfDoc.getPage(i);

        // Erase overlays
        eraseRects
          .filter(rect => rect.page === pageIdx && rect.erased)
          .forEach(rect => {
            page.drawRectangle({
              x: rect.left * scaleX,
              y: (cssPixelHeight - rect.top - rect.height) * scaleY,
              width: rect.width * scaleX,
              height: rect.height * scaleY,
              color: rgb(1, 1, 1),
              opacity: 1,
            });
          });

        // Blur overlays
        blurredRects
          .filter(rect => rect.page === pageIdx)
          .forEach(rect => {
            page.drawRectangle({
              x: rect.left * scaleX,
              y: (cssPixelHeight - rect.top - rect.height) * scaleY,
              width: rect.width * scaleX,
              height: rect.height * scaleY,
              color: rgb(1, 1, 1),
              opacity: 0.7,
            });
          });

        // Text overlays
        textBoxes
  .filter(box => box.page === pageIdx)
  .forEach(box => {
    const hex = (box.color || '#222').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
    const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
    const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

    const fontSizePt = box.fontSize || 16;
    const lineHeightRatio = box.lineHeight || 1.2;
    const textLines = box.text.split('\n');

    textLines.forEach((line, i) => {
      const y =
        (cssPixelHeight - box.top - fontSizePt * (i + 1) * lineHeightRatio) * scaleY;

      page.drawText(line, {
        x: box.left * scaleX,
        y: y,
        size: fontSizePt * scaleY,
        font,
        color: rgb(r, g, b),
        maxWidth: 200 * scaleX,
      });
    });
  });

      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modified.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert('Failed to save and download PDF: ' + (err?.message || err));
    }
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 ">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="mb-4 block mx-auto p-2 border rounded"
        />
      </div>
      {pdfFile && (
        <div className="max-w-[calc(100%-20rem)] mx-auto">
          <div
            className="toolbar bg-gray-500 p-4 mb-4 rounded flex gap-4 justify-center"
          >
            {(addTextMode || activeTextBox) ? (
              <TextStyleToolbar />
            ) : (
              <>
                <button
                  className={`px-4 py-2 rounded ${addTextMode ? 'bg-blue-400 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                  type="button"
                  onClick={() => {
                    setActiveTextBox({ top: 300, left: 220, text: '', color: textColor, fontSize, fontFamily, lineHeight });
                    setAddTextMode(true);
                  }}
                >
                  Add Text
                </button>
                <button
                  className={`px-4 py-2 rounded ${eraseMode ? 'bg-red-400 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                  type="button"
                  tabIndex={-1}
                  onClick={handleEraseButton}
                >
                  Erase
                </button>
                <button
                  onClick={handleBlur}
                  className="px-4 py-2 rounded bg-purple-100 text-purple-600 hover:bg-purple-200"
                  type="button"
                >
                  Blur
                </button>
              </>
            )}
          </div>
          <div className="navigation flex justify-center gap-4 mt-4">
            <button
              onClick={handlePrevPage}
              disabled={pageNumber <= 1}
              className="bg-gray-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
              type="button"
            >
              Previous
            </button>
            <p className="text-center text-gray-500">
              Page {pageNumber} of {numPages}
            </p>
            <button
              onClick={handleNextPage}
              disabled={pageNumber >= numPages}
              className="bg-gray-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
              type="button"
            >
              Next
            </button>
          </div>
          <div
            className="pdf-container"
            ref={pdfWrapperRef}
            style={{position:'relative', width: 'fit-content', margin: '0 auto' }}
          >
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              className="flex flex-col items-center"
            >
              <Page
                inputRef={pageRef}
                pageNumber={pageNumber}
                className="border"
                renderTextLayer={true}
                renderAnnotationLayer={true}
                onRenderSuccess={onPageRenderSuccess}
              />
            </Document>
            {/* Canvas overlay */}
            <canvas
              ref={canvasRef}
              width={pageDims.width}
              height={pageDims.height}
              style={{
                position: 'absolute',
                top:  0,
                left:0,
                pointerEvents: (eraseMode || (addTextMode && !activeTextBox)) ? 'auto' : 'none',
                zIndex: 10000,
                width: pageDims.width,
                height: pageDims.height,
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onClick={
                addTextMode && !eraseMode && !activeTextBox
                  ? handlePdfClick
                  : undefined
              }
            />
            {/* Render blurred overlays using CSS backdrop-filter */}
            {blurredRects
              .filter(rect => rect.page === pageNumber)
              .map((rect, idx) => (
                <div
                  key={`blur-overlay-${idx}`}
                  style={{
                    position: 'absolute',
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    zIndex: 12000,
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    background: 'rgba(255,255,255,0.3)',
                    pointerEvents: 'none',
                  }}
                />
              ))
            }
            {/* Render saved text boxes */}
            {textBoxes
  .filter(box => box.page === pageNumber)
  .map(box => {
    if (activeTextBox?.id === box.id) return null; // Hide saved version while editing

    return (
      <div
        key={box.id}
        style={{
          position: 'absolute',
          top: box.top,
          left: box.left,
          zIndex: 15000,
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid #2563eb',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: box.fontSize || 16,
          color: box.color || '#222',
          fontFamily: box.fontFamily || 'Arial, sans-serif',
          lineHeight: box.lineHeight || 1.2,
          pointerEvents: dragging && draggedBoxId === box.id ? 'none' : 'auto',
          userSelect: 'none',
          maxWidth: 200,
          overflowWrap: 'break-word',
          cursor: dragging && draggedBoxId === box.id ? 'grabbing' : 'grab',
          whiteSpace: 'pre-wrap',
        }}
        onMouseDown={e => handleSavedBoxMouseDown(e, box)}
        onMouseUp={e => {
          handleSavedBoxMouseUp(e);
          if (!dragging) {
            handleSavedBoxClick(e, box);
          }
        }}
        onClick={e => handleSavedBoxClick(e, box)}
      >
        {box.text}
      </div>
    );
  })}

            {/* Overlay buttons */}
            <EraseButtonsOverlay />
            <BlurButtonsOverlay />
            <UndoEraseButtonsOverlay />
            {/* Active text box editor - render last so it's on top */}
            {activeTextBox && (
              <div
                style={{
                  position: 'absolute',
                  top: activeTextBox.top,
                  left: activeTextBox.left,
                  zIndex: 20000,
                  background: '#fff',
                  border: '2px solid #2563eb',
                  borderRadius: 4,
                  padding: 4,
                  minWidth: 120,
                  minHeight: 32,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: dragging ? 'grabbing' : 'grab',
                  userSelect: dragging ? 'none' : 'auto',
                }}
                onMouseDown={handleTextBoxMouseDown}
              >
                <textarea
                  autoFocus
                  value={activeTextBox.text}
                  style={{
                    width: '100%',
                    minWidth: 100,
                    border: 'none',
                    outline: 'none',
                    fontSize: fontSize,
                    background: 'transparent',
                    color: textColor,
                    fontFamily: fontFamily,
                    lineHeight: lineHeight,
                    resize: 'none',
                    minHeight: 32,
                    whiteSpace: 'pre-wrap',
                  }}
                  rows={3}
                  onChange={e => setActiveTextBox(box => ({ ...box, text: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveTextBox();
                    }
                    if (e.key === 'Escape') handleCancelTextBox();
                  }}
                  placeholder="Type here..."
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 10px',
                      fontSize: 14,
                      cursor: 'pointer'
                    }}
                    onClick={handleSaveTextBox}
                  >
                    Save
                  </button>
                  <button
                    style={{
                      background: '#888',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 10px',
                      fontSize: 14,
                      cursor: 'pointer'
                    }}
                    onClick={handleCancelTextBox}
                  >
                    Cancel
                  </button>
                  {activeTextBox.editMode && (
                    <button
                      style={{
                        background: '#f87171',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '2px 10px',
                        fontSize: 14,
                        cursor: 'pointer'
                      }}
                      onClick={handleDeleteTextBox}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Save and Download Button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={handleSaveAndDownload}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
              type="button"
            >
              Save and Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PDFEditor;
