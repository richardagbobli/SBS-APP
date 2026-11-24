import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crop,
  Download,
  Image as ImageIcon,
  PenTool,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  buildRotatedCanvas,
  DEFAULT_SIGNATURE_OPTIONS,
  extractSignatureFromCanvas,
  loadImageElement,
  readFileToDataUrl,
  SignatureCropBox,
  SignatureExtractOptions,
  SignatureExtractResult,
  SignatureInkStyle,
} from '../lib/signatureExtractor';

export type SignatureRoleKey = 'headteacher' | 'teacher' | 'parent';

interface SignatureExtractorModalProps {
  isOpen: boolean;
  role: SignatureRoleKey;
  roleTitle: string;
  signerName?: string;
  existingSignatureUrl?: string;
  saving?: boolean;
  onClose: () => void;
  onApply: (extractedPngDataUrl: string) => Promise<void> | void;
}

const FULL_CROP: SignatureCropBox = { x: 0, y: 0, width: 1, height: 1 };
const CENTER_STRIP_CROP: SignatureCropBox = { x: 0.06, y: 0.22, width: 0.88, height: 0.56 };

export function SignatureExtractorModal({
  isOpen,
  role,
  roleTitle,
  signerName,
  existingSignatureUrl,
  saving = false,
  onClose,
  onApply,
}: SignatureExtractorModalProps) {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [rotatedPreviewUrl, setRotatedPreviewUrl] = useState<string>('');
  const [options, setOptions] = useState<SignatureExtractOptions>(DEFAULT_SIGNATURE_OPTIONS);
  const [result, setResult] = useState<SignatureExtractResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live Camera Scanner State
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Interactive Pointer Crop Selection State
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCameraStarting(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setErrorMsg(null);
      return;
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  // Rebuild rotated working canvas whenever sourceImage or rotation changes
  useEffect(() => {
    if (!sourceImage) {
      rotatedCanvasRef.current = null;
      setRotatedPreviewUrl('');
      setResult(null);
      return;
    }
    const canvas = buildRotatedCanvas(sourceImage, options.rotation);
    rotatedCanvasRef.current = canvas;
    setRotatedPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
  }, [sourceImage, options.rotation]);

  // Re-run transparent signature extraction whenever options or rotated canvas updates
  useEffect(() => {
    const canvas = rotatedCanvasRef.current;
    if (!canvas) {
      setResult(null);
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const extracted = extractSignatureFromCanvas(canvas, options);
        setResult(extracted);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to extract signature from this image.'
        );
      }
    }, 35);
    return () => window.clearTimeout(timer);
  }, [rotatedPreviewUrl, options]);

  const loadSourceFromDataUrl = async (dataUrl: string, initialCrop?: SignatureCropBox) => {
    setErrorMsg(null);
    try {
      const img = await loadImageElement(dataUrl);
      setSourceImage(img);
      setOptions((prev) => ({
        ...prev,
        rotation: 0,
        crop: initialCrop || { x: 0.04, y: 0.14, width: 0.92, height: 0.72 },
      }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load image.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid photo or image file (JPG, PNG, WebP).');
      return;
    }
    stopCamera();
    try {
      const dataUrl = await readFileToDataUrl(file);
      await loadSourceFromDataUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not read image file.');
    }
  };

  const handleDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please drop an image file (JPG, PNG, WebP).');
      return;
    }
    stopCamera();
    try {
      const dataUrl = await readFileToDataUrl(file);
      await loadSourceFromDataUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not read dropped image.');
    }
  };

  const handleStartLiveCamera = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg(
        'Live camera preview is not available in this browser. Use "Take Photo of Paper" or "Upload Image" instead.'
      );
      return;
    }
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setErrorMsg(
        'Camera permission was blocked or unavailable. You can still tap "Take Photo of Paper" or upload a saved photo.'
      );
      stopCamera();
    } finally {
      setCameraStarting(false);
    }
  };

  const handleCaptureCameraFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    // Pre-crop right onto the on-screen paper guide box
    await loadSourceFromDataUrl(dataUrl, { x: 0.1, y: 0.25, width: 0.8, height: 0.5 });
  };

  const getRelativePoint = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = pt;
    setIsDraggingCrop(true);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCrop || !dragStartRef.current) return;
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    const start = dragStartRef.current;
    const x = Math.min(start.x, pt.x);
    const y = Math.min(start.y, pt.y);
    const width = Math.max(0.08, Math.abs(pt.x - start.x));
    const height = Math.max(0.08, Math.abs(pt.y - start.y));
    setOptions((prev) => ({
      ...prev,
      crop: {
        x: Math.min(x, 1 - width),
        y: Math.min(y, 1 - height),
        width,
        height,
      },
    }));
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingCrop) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsDraggingCrop(false);
      dragStartRef.current = null;
    }
  };

  const handleDownloadExtractedPng = () => {
    if (!result?.dataUrl) return;
    const link = document.createElement('a');
    link.href = result.dataUrl;
    link.download = `${role}_signature.png`;
    link.click();
  };

  const handleConfirmApply = async () => {
    if (!result?.dataUrl || !result.hasInk) {
      setErrorMsg(
        'No clear signature ink was detected inside the crop box. Drag the blue box over the signature or increase Ink Sensitivity.'
      );
      return;
    }
    setErrorMsg(null);
    try {
      await onApply(result.dataUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save extracted signature. Please try again.'
      );
    }
  };

  if (!isOpen) return null;

  const crop = options.crop || FULL_CROP;
  const roleBadgeColor =
    role === 'headteacher'
      ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
      : role === 'teacher'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
      : 'bg-amber-100 text-amber-900 border-amber-200';

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-4xl max-h-[94dvh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-indigo-50/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-700 text-white flex items-center justify-center shrink-0">
              <PenTool className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  Extract {roleTitle}
                </h2>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${roleBadgeColor}`}
                >
                  Paper &amp; Image Scanner
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                {signerName ? `Signer: ${signerName} · ` : ''}
                Upload a photo or scan a sheet of paper — paper background is removed automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close signature extractor"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Input Action Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors">
              <Upload className="w-4 h-4 shrink-0" />
              <span>Upload Image / Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleFileChange(e)}
                className="sr-only"
              />
            </label>

            <label className="min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors">
              <Camera className="w-4 h-4 shrink-0" />
              <span>Take Photo of Paper</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void handleFileChange(e)}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={() => (cameraOpen ? stopCamera() : void handleStartLiveCamera())}
              disabled={cameraStarting}
              className={`min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                cameraOpen
                  ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <ScanLine className="w-4 h-4 shrink-0" />
              <span>
                {cameraStarting
                  ? 'Opening Camera…'
                  : cameraOpen
                  ? 'Close Live Scanner'
                  : 'Live Camera Scan'}
              </span>
            </button>
          </div>

          {/* Live Camera Paper Viewfinder */}
          {cameraOpen && (
            <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 relative">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full max-h-[340px] object-cover"
              />
              {/* Paper Signature Alignment Guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="w-[82%] h-[50%] border-2 border-dashed border-amber-300 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] flex items-end justify-center pb-2">
                  <span className="text-[11px] font-semibold text-amber-200 bg-slate-950/75 px-2.5 py-0.5 rounded">
                    Align handwritten signature inside this box
                  </span>
                </div>
              </div>
              <div className="p-3 bg-slate-900 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-300">
                  Use bright, even light over white or lined paper.
                </span>
                <button
                  type="button"
                  onClick={() => void handleCaptureCameraFrame()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Camera className="w-4 h-4" />
                  Capture Paper
                </button>
              </div>
            </div>
          )}

          {/* Empty Drop Zone OR Interactive Extraction Studio */}
          {!sourceImage && !cameraOpen ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => void handleDropFile(e)}
              className="border-2 border-dashed border-slate-300 rounded-2xl p-6 sm:p-8 bg-slate-50/70 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 mx-auto flex items-center justify-center">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <div className="text-sm font-bold text-slate-900">
                  Sign on a plain sheet of paper, snap a photo, or drop an image here
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The scanner automatically removes the white/lined paper background, cleans lighting shadows, crops tightly around the pen strokes, and outputs a transparent report-card signature.
                </p>
              </div>
              {existingSignatureUrl && (
                <div className="pt-3 border-t border-slate-200 max-w-xs mx-auto space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Currently Saved {roleTitle}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center">
                    <img
                      src={existingSignatureUrl}
                      alt={roleTitle}
                      referrerPolicy="no-referrer"
                      className="max-h-12 max-w-[180px] object-contain"
                    />
                    <div className="w-40 border-t border-slate-400 mt-1.5 pt-1 text-[10px] text-slate-500">
                      {roleTitle}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {sourceImage && rotatedPreviewUrl && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left: Source Paper Image with Interactive Drag-to-Crop */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Crop className="w-3.5 h-3.5 text-indigo-600" />
                    <span>1. Drag over the signature on paper to crop</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((prev) => ({
                          ...prev,
                          rotation: (((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270),
                        }))
                      }
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Rotate 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => ({ ...prev, crop: CENTER_STRIP_CROP }))}
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => ({ ...prev, crop: FULL_CROP }))}
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Full Image
                    </button>
                  </div>
                </div>

                <div
                  ref={stageRef}
                  onPointerDown={handleStagePointerDown}
                  onPointerMove={handleStagePointerMove}
                  onPointerUp={handleStagePointerUp}
                  className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-900 select-none touch-none cursor-crosshair"
                >
                  <img
                    src={rotatedPreviewUrl}
                    alt="Original signature source"
                    draggable={false}
                    className="w-full max-h-[300px] sm:max-h-[340px] object-contain mx-auto block"
                  />
                  {/* Interactive Crop Rectangle Overlay */}
                  <div
                    className="pointer-events-none absolute border-2 border-indigo-500 bg-indigo-500/12 shadow-[0_0_0_9999px_rgba(15,23,42,0.38)]"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.width * 100}%`,
                      height: `${crop.height * 100}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 bg-indigo-700 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      Extraction Area
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tip: If your photo shows a whole page or multiple signatures, drag across just the one signature you want to extract.
                </p>
              </div>

              {/* Right: Live Extracted Signature & Ink Tuning */}
              <div className="lg:col-span-5 space-y-3.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      <span>2. Extracted Transparent Signature</span>
                    </div>
                    {result?.hasInk && (
                      <button
                        type="button"
                        onClick={handleDownloadExtractedPng}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        PNG
                      </button>
                    )}
                  </div>

                  {/* Report Card Signature Line Live Preview */}
                  <div
                    className="rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-end min-h-[126px]"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)',
                      backgroundSize: '14px 14px',
                      backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    {result?.hasInk && result.dataUrl ? (
                      <img
                        src={result.dataUrl}
                        alt={`Extracted ${roleTitle}`}
                        className="max-h-16 max-w-[230px] object-contain"
                      />
                    ) : (
                      <div className="text-xs text-slate-400 italic py-4">
                        Adjust sensitivity or drag crop box over the pen strokes…
                      </div>
                    )}
                    <div className="w-48 border-t border-slate-500 mt-2 pt-1 text-center text-[11px] font-medium text-slate-700 bg-white/85 px-2 rounded">
                      {roleTitle}
                      {signerName ? ` (${signerName})` : ''}
                    </div>
                  </div>
                </div>

                {/* Extraction Controls */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Ink Cleanup &amp; Styling</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Paper Removal Sensitivity
                      </label>
                      <span className="font-mono font-bold text-indigo-700">
                        {options.sensitivity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={92}
                      step={1}
                      value={options.sensitivity}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          sensitivity: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-indigo-600 h-2 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>Cleaner paper</span>
                      <span>Capture faint ink</span>
                    </div>
                  </div>

                  <div>
                    <span className="block font-semibold text-slate-700 mb-1.5">Ink Colour</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'blue', label: 'Blue Pen', dot: 'bg-blue-900' },
                          { id: 'black', label: 'Black Ink', dot: 'bg-slate-900' },
                          { id: 'original', label: 'Original', dot: 'bg-gradient-to-tr from-blue-700 to-emerald-600' },
                        ] as Array<{ id: SignatureInkStyle; label: string; dot: string }>
                      ).map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() =>
                            setOptions((prev) => ({ ...prev, inkStyle: style.id }))
                          }
                          className={`min-h-[38px] px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                            options.inkStyle === style.id
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-950'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                          <span>{style.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-1.5 pt-1">
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.denoise}
                        onChange={(e) =>
                          setOptions((prev) => ({ ...prev, denoise: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Remove paper specks &amp; grain</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.enhanceStrokes}
                        onChange={(e) =>
                          setOptions((prev) => ({ ...prev, enhanceStrokes: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Crispen thin pen strokes for print</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.autoTrim}
                        onChange={(e) =>
                          setOptions((prev) => ({ ...prev, autoTrim: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Auto-trim empty borders</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 pb-safe">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || !result?.hasInk || !result?.dataUrl}
            onClick={() => void handleConfirmApply()}
            className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-700 to-teal-600 rounded-xl hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving Signature…' : `Use Extracted ${roleTitle}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
