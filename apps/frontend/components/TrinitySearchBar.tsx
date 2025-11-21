'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';

type ParsedFilters = {
  impact_domain: string[];
  functional_role: string[];
  experience_level: string;
  location: string;
  is_remote: boolean;
  free_text: string;
};

type Suggestion = {
  text: string;
  type: string;
  filters: ParsedFilters;
  confidence: number;
};

type TrinitySearchBarProps = {
  onSearch: (filters: ParsedFilters, freeText: string) => void;
  initialQuery?: string;
};

export default function TrinitySearchBar({ onSearch, initialQuery = '' }: TrinitySearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [parsedFilters, setParsedFilters] = useState<ParsedFilters>({
    impact_domain: [],
    functional_role: [],
    experience_level: '',
    location: '',
    is_remote: false,
    free_text: '',
  });
  const [activeChips, setActiveChips] = useState<Array<{ type: string; label: string; value: string }>>([]);
  const [loading, setLoading] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text || text.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      
      if (data.status === 'ok' && data.data) {
        setSuggestions(data.data);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSuggestions([]);
    }
  }, []);

  // Parse query when user submits
  const parseQuery = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      onSearch(parsedFilters, '');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/search/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      
      const data = await res.json();
      
      if (data.status === 'ok' && data.data) {
        const parsed = data.data;
        setParsedFilters(parsed);
        
        // Build active chips
        const chips: Array<{ type: string; label: string; value: string }> = [];
        
        parsed.impact_domain?.forEach((domain: string) => {
          chips.push({ type: 'impact_domain', label: domain, value: domain });
        });
        
        parsed.functional_role?.forEach((role: string) => {
          chips.push({ type: 'functional_role', label: role, value: role });
        });
        
        if (parsed.experience_level) {
          chips.push({ type: 'experience_level', label: parsed.experience_level, value: parsed.experience_level });
        }
        
        if (parsed.location) {
          chips.push({ type: 'location', label: parsed.location, value: parsed.location });
        }
        
        if (parsed.is_remote) {
          chips.push({ type: 'is_remote', label: 'Remote', value: 'remote' });
        }
        
        setActiveChips(chips);
        
        // Trigger search with parsed filters
        onSearch(parsed, parsed.free_text || '');
      } else {
        // Fallback: use query as free text
        onSearch(parsedFilters, searchQuery);
      }
    } catch (error) {
      console.error('Parse query error:', error);
      // Fallback: use query as free text
      onSearch(parsedFilters, searchQuery);
    } finally {
      setLoading(false);
      setShowSuggestions(false);
    }
  }, [onSearch, parsedFilters]);

  // Handle input change with debounced autocomplete
  const handleInputChange = (value: string) => {
    setQuery(value);
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: Suggestion) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
    parseQuery(suggestion.text);
  };

  // Handle chip removal
  const handleChipRemove = (chipIndex: number) => {
    const chip = activeChips[chipIndex];
    const newChips = activeChips.filter((_, i) => i !== chipIndex);
    setActiveChips(newChips);
    
    // Update parsed filters
    const newFilters = { ...parsedFilters };
    
    if (chip.type === 'impact_domain') {
      newFilters.impact_domain = newFilters.impact_domain.filter(d => d !== chip.value);
    } else if (chip.type === 'functional_role') {
      newFilters.functional_role = newFilters.functional_role.filter(r => r !== chip.value);
    } else if (chip.type === 'experience_level') {
      newFilters.experience_level = '';
    } else if (chip.type === 'location') {
      newFilters.location = '';
    } else if (chip.type === 'is_remote') {
      newFilters.is_remote = false;
    }
    
    setParsedFilters(newFilters);
    
    // Re-trigger search
    onSearch(newFilters, query);
  };

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    parseQuery(query);
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search roles, domains, or skills... (e.g., 'WASH officer Kenya mid-level')"
            className="w-full pl-12 pr-12 py-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveChips([]);
                setParsedFilters({
                  impact_domain: [],
                  functional_role: [],
                  experience_level: '',
                  location: '',
                  is_remote: false,
                  free_text: '',
                });
                onSearch(parsedFilters, '');
              }}
              className="absolute right-4 p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>
      </form>

      {/* Active Chips */}
      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeChips.map((chip, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => handleChipRemove(index)}
                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Autocomplete Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="font-medium text-gray-900">{suggestion.text}</div>
              {suggestion.type && (
                <div className="text-xs text-gray-500 mt-1 capitalize">{suggestion.type.replace('_', ' ')}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

