'use client';

import { AlertTriangle, CheckCircle, Info, MapPin, Eye } from 'lucide-react';

type DataQualityBadgeProps = {
  score: number | null;
  grade?: 'high' | 'medium' | 'low' | 'very_low' | null;
  issues?: string[];
  warnings?: string[];
  needsReview?: boolean;
  isRemote?: boolean;
  geocoded?: boolean;
  size?: 'sm' | 'md';
};

export default function DataQualityBadge({ 
  score, 
  grade,
  issues = [], 
  warnings = [], 
  needsReview = false,
  isRemote = false,
  geocoded = false,
  size = 'sm' 
}: DataQualityBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#D2D2D7] ${size === 'sm' ? 'text-xs' : 'text-sm'} font-light bg-[#F5F5F7] text-[#86868B]`} title="No quality score available">
        <Info className="w-3 h-3" />
        No score
      </span>
    );
  }

  // Convert 0.0-1.0 score to 0-100 for display
  const displayScore = score <= 1.0 ? Math.round(score * 100) : score;

  const getQualityColor = (score: number, grade?: string | null) => {
    // Use grade if available, otherwise infer from score
    const effectiveGrade = grade || (score >= 0.85 ? 'high' : score >= 0.70 ? 'medium' : score >= 0.50 ? 'low' : 'very_low');
    
    if (effectiveGrade === 'high') return { bg: 'bg-[#30D158]/10', text: 'text-[#30D158]', border: 'border-[#30D158]/20' };
    if (effectiveGrade === 'medium') return { bg: 'bg-[#FF9500]/10', text: 'text-[#FF9500]', border: 'border-[#FF9500]/20' };
    return { bg: 'bg-[#FF3B30]/10', text: 'text-[#FF3B30]', border: 'border-[#FF3B30]/20' };
  };

  const getQualityLabel = (score: number, grade?: string | null) => {
    const effectiveGrade = grade || (score >= 0.85 ? 'high' : score >= 0.70 ? 'medium' : score >= 0.50 ? 'low' : 'very_low');
    return effectiveGrade.charAt(0).toUpperCase() + effectiveGrade.slice(1).replace('_', ' ');
  };

  const colors = getQualityColor(score, grade);
  const label = getQualityLabel(score, grade);
  const hasIssues = (issues && issues.length > 0) || (warnings && warnings.length > 0) || needsReview;

  return (
    <div className="relative group inline-block">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border} ${size === 'sm' ? 'text-xs' : 'text-sm'} font-light cursor-help whitespace-nowrap`}>
        {needsReview ? (
          <Eye className="w-3 h-3 flex-shrink-0" />
        ) : hasIssues ? (
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
        ) : (
          <CheckCircle className="w-3 h-3 flex-shrink-0" />
        )}
        <span className="whitespace-nowrap">{displayScore}/100</span>
        {grade && (
          <span className="whitespace-nowrap text-[#86868B] font-light">• {label}</span>
        )}
        {isRemote && (
          <MapPin className="w-3 h-3 flex-shrink-0 text-[#86868B]" title="Remote job" />
        )}
        {geocoded && !isRemote && (
          <MapPin className="w-3 h-3 flex-shrink-0 text-[#30D158]" title="Location geocoded" />
        )}
      </span>
      
      {/* Tooltip on hover */}
      {(hasIssues || needsReview || geocoded) && (
        <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-[#1D1D1F] text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-200">
          <div className="font-light mb-1.5 border-b border-white/10 pb-1">
            <span className="font-medium">Quality: {label}</span>
            <span className="text-[#86868B] ml-1">({displayScore}/100)</span>
          </div>
          {needsReview && (
            <div className="mb-1.5 text-[#FF9500] font-light">
              <Eye className="w-3 h-3 inline mr-1" />
              Needs manual review
            </div>
          )}
          {issues && issues.length > 0 && (
            <div className="mb-1.5">
              <div className="text-[#FF3B30] font-light mb-0.5">Issues:</div>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                {issues.slice(0, 3).map((issue, idx) => (
                  <li key={idx} className="text-[#86868B] font-light">{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings && warnings.length > 0 && (
            <div className="mb-1.5">
              <div className="text-[#FF9500] font-light mb-0.5">Warnings:</div>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                {warnings.slice(0, 2).map((warning, idx) => (
                  <li key={idx} className="text-[#86868B] font-light">{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {geocoded && (
            <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[#30D158] font-light">
              <MapPin className="w-3 h-3 inline mr-1" />
              Location geocoded
            </div>
          )}
        </div>
      )}
    </div>
  );
}

