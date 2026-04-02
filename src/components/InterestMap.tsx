import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Sparkles, RefreshCw, Loader2, ZoomIn, ZoomOut, Maximize2, MousePointer2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Prediction {
  name: string;
  type: "preference" | "place" | "order" | "general";
  reason: string;
  country?: string;
}

interface InterestMapProps {
  selectedChips: string[];
  predictions: Prediction[];
  onRefresh?: () => Promise<void>;
  onSavePrediction?: (prediction: Prediction) => Promise<void>;
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

export default function InterestMap({ selectedChips, predictions, onRefresh, onSavePrediction }: InterestMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async (p: Prediction) => {
    if (!onSavePrediction) return;
    setIsSaving(p.name);
    try {
      await onSavePrediction(p);
    } finally {
      setIsSaving(null);
    }
  };

  useEffect(() => {
    if (svgRef.current && (selectedChips.length > 0 || predictions.length > 0)) {
      const width = 800;
      const height = 500;
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const container = svg.append("g").attr("class", "zoom-container");

      const zoom = d3.zoom()
        .scaleExtent([0.5, 5])
        .on("zoom", (event) => {
          container.attr("transform", event.transform);
          setZoomLevel(event.transform.k);
        });

      svg.call(zoom as any);

      const data = [
        ...selectedChips.map(c => ({ id: c, group: "like", radius: 45 })),
        ...predictions.map(p => ({ id: p.name, group: "prediction", radius: 40, reason: p.reason }))
      ];

      const simulation = d3.forceSimulation(data as any)
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("collide", d3.forceCollide().radius(d => (d as any).radius + 15))
        .on("tick", () => {
          node.attr("transform", d => `translate(${(d as any).x}, ${(d as any).y})`);
        });

      const node = container.append("g")
        .selectAll("g")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "cursor-pointer")
        .on("click", (event, d: any) => {
          setSelectedNodeId(prev => prev === d.id ? null : d.id);
        });

      // Add glow effect
      const defs = svg.append("defs");
      const filter = defs.append("filter").attr("id", "glow");
      filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
      const feMerge = filter.append("feMerge");
      feMerge.append("feMergeNode").attr("in", "coloredBlur");
      feMerge.append("feMergeNode").attr("in", "SourceGraphic");

      node.append("circle")
        .attr("r", d => d.radius)
        .attr("fill", d => d.group === "like" ? "#2563eb" : "white")
        .attr("stroke", d => {
          if (selectedNodeId === d.id) return "#2563eb";
          return d.group === "like" ? "#1d4ed8" : "#e2e8f0";
        })
        .attr("stroke-width", d => selectedNodeId === d.id ? 4 : 2)
        .attr("filter", d => selectedNodeId === d.id ? "url(#glow)" : "none")
        .attr("class", "transition-all duration-300 hover:scale-110 shadow-lg");

      node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .attr("fill", d => d.group === "like" ? "white" : "#1e293b")
        .attr("font-size", "11px")
        .attr("font-weight", "900")
        .attr("class", "pointer-events-none uppercase tracking-tighter")
        .text(d => d.id.length > 12 ? d.id.substring(0, 10) + "..." : d.id);
    }
  }, [selectedChips, predictions, selectedNodeId]);

  const handleResetZoom = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().duration(750).call(d3.zoom().transform as any, d3.zoomIdentity);
  };

  const filteredPredictions = selectedNodeId 
    ? predictions.filter(p => p.name === selectedNodeId)
    : predictions;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Your Interest Map</h2>
          <p className="text-sm text-slate-500">
            {selectedNodeId ? `Showing details for "${selectedNodeId}"` : "Visualizing your world and our predictions."}
          </p>
        </div>
        <div className="flex gap-4 items-center">
          {selectedNodeId && (
            <button
              onClick={() => setSelectedNodeId(null)}
              className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              Clear Filter
            </button>
          )}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-black hover:bg-blue-100 transition-all disabled:opacity-50"
            >
              {isRefreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {isRefreshing ? "SEARCHING..." : "REFRESH REAL PLACES"}
            </button>
          )}
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            <span>Your Likes</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <div className="w-3 h-3 rounded-full bg-white border border-slate-200" />
            <span>AI Predictions</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="bg-slate-50 rounded-[40px] border border-slate-100 overflow-hidden relative group">
          <svg ref={svgRef} width="800" height="500" className="mx-auto max-w-full h-auto cursor-grab active:cursor-grabbing" />
          
          {/* Map Controls */}
          <div className="absolute bottom-6 right-6 flex flex-col gap-2">
            <button 
              onClick={handleResetZoom}
              className="p-3 bg-white border border-slate-200 rounded-2xl shadow-lg text-slate-600 hover:text-blue-600 transition-all hover:scale-110"
              title="Reset View"
            >
              <Maximize2 size={20} />
            </button>
            <div className="p-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col gap-1">
              <div className="px-2 py-1 text-[10px] font-black text-slate-400 text-center border-b border-slate-100 mb-1">
                {Math.round(zoomLevel * 100)}%
              </div>
              <div className="flex flex-col gap-2 items-center">
                <ZoomIn size={16} className="text-slate-400" />
                <div className="w-1 h-12 bg-slate-100 rounded-full relative">
                  <div 
                    className="absolute bottom-0 left-0 w-full bg-blue-500 rounded-full transition-all" 
                    style={{ height: `${(zoomLevel - 0.5) / 4.5 * 100}%` }}
                  />
                </div>
                <ZoomOut size={16} className="text-slate-400" />
              </div>
            </div>
          </div>

          {/* Interaction Tip */}
          <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full text-[10px] font-black text-slate-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <MousePointer2 size={12} />
            DRAG TO PAN • SCROLL TO ZOOM • CLICK NODES
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h4 className="col-span-full text-xs font-black text-slate-400 uppercase tracking-widest px-2 flex items-center justify-between">
            <span>{selectedNodeId ? `Details for "${selectedNodeId}"` : "Explore Recommendations"}</span>
            <span className="h-px flex-1 bg-slate-100 mx-4" />
          </h4>
          <AnimatePresence mode="popLayout">
            {filteredPredictions.map((p, i) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={p.name} 
                onClick={() => setSelectedNodeId(p.name)}
                className={cn(
                  "p-5 border rounded-3xl flex items-start justify-between gap-4 group cursor-pointer transition-all relative overflow-hidden",
                  selectedNodeId === p.name 
                    ? "bg-blue-600 border-blue-600 shadow-xl shadow-blue-200" 
                    : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-100"
                )}
              >
                <div className="flex items-start gap-4 relative z-10">
                  <div className={cn(
                    "p-3 rounded-2xl shrink-0 transition-transform group-hover:scale-110",
                    selectedNodeId === p.name ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
                  )}>
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-black text-base tracking-tight",
                        selectedNodeId === p.name ? "text-white" : "text-slate-900"
                      )}>{p.name}</span>
                      {p.country && (
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                          selectedNodeId === p.name ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                        )}>
                          {p.country}
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      "text-xs mt-1 leading-relaxed font-medium",
                      selectedNodeId === p.name ? "text-blue-50" : "text-slate-500"
                    )}>{p.reason}</p>
                  </div>
                </div>
                {onSavePrediction && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSave(p);
                    }}
                    disabled={isSaving === p.name}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black transition-all disabled:opacity-50 shrink-0 shadow-sm",
                      selectedNodeId === p.name 
                        ? "bg-white text-blue-600 hover:bg-blue-50" 
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    )}
                  >
                    {isSaving === p.name ? <Loader2 size={12} className="animate-spin" /> : "SAVE TO MEMORY"}
                  </button>
                )}
                
                {/* Decorative background icon */}
                <div className={cn(
                  "absolute -right-4 -bottom-4 opacity-[0.05] transition-opacity",
                  selectedNodeId === p.name ? "text-white" : "text-blue-600"
                )}>
                  <Sparkles size={100} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {filteredPredictions.length === 0 && selectedNodeId && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full p-12 bg-slate-50 rounded-[40px] border border-dashed border-slate-200 text-center"
            >
              <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center text-blue-600 mx-auto mb-4 shadow-sm">
                <MousePointer2 size={32} />
              </div>
              <h3 className="font-black text-slate-900 text-lg">Existing Interest</h3>
              <p className="text-slate-500 font-medium max-w-xs mx-auto mt-2">
                "{selectedNodeId}" is already part of your core interests. I'll keep looking for new connections!
              </p>
              <button 
                onClick={() => setSelectedNodeId(null)}
                className="mt-6 px-6 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50 transition-all"
              >
                VIEW ALL PREDICTIONS
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
