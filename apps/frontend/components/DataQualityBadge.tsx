'use client';

import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

type DataQualityBadgeProps = {
  score: number | null;
  issues?: string[];
  warnings?: string[];
  size?: 'sm' | 'md';
};

export default function DataQualityBadge({ 
  score, 
  issues = [], 
  warnings = [], 
  size = 'sm' 
}: DataQualityBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#D2D2D7] ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium bg-[#F5F5F7] text-[#86868B]`}>
        <Info className="w-3 h-3" />
        No score
      </span>
    );
  }

  const getQualityColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-[#30D158]/10', text: 'text-[#30D158]', border: 'border-[#30D158]/20' };
    if (score >= 60) return { bg: 'bg-[#FF9500]/10', text: 'text-[#FF9500]', border: 'border-[#FF9500]/20' };
    return { bg: 'bg-[#FF3B30]/10', text: 'text-[#FF3B30]', border: 'border-[#FF3B30]/20' };
  };

  const getQualityLabel = (score: number) => {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    return 'Low';
  };

  const colors = getQualityColor(score);
  const label = getQualityLabel(score);
  const hasIssues = (issues && issues.length > 0) || (warnings && warnings.length > 0);

  return (
    <div className="relative group">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border} ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium cursor-help`}>
        {hasIssues ? (
          <AlertTriangle className="w-3 h-3" />
        ) : (
          <CheckCircle className="w-3 h-3" />
        )}
        {score}/100
      </span>
      
      {/* Tooltip on hover */}
      {hasIssues && (
        <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-[#1D1D1F] text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
          <div className="font-medium mb-1">Quality: {label}</div>
          {issues && issues.length > 0 && (
            <div className="mb-1">
              <div className="text-[#FF3B30] font-medium">Issues:</div>
              <ul className="list-disc list-inside ml-2">
                {issues.slice(0, 3).map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings && warnings.length > 0 && (
            <div>
              <div className="text-[#FF9500] font-medium">Warnings:</div>
              <ul className="list-disc list-inside ml-2">
                {warnings.slice(0, 2).map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

