import React, {useEffect, useState} from "react";
import {resolveName} from "@/lib/cryptoNameHelpers.ts";
import {truncateString} from "@/lib/cryptoFormat.ts";

interface AddressDisplayProps {
  value: string;
  length?: number;
  mdLength?: number;
  small?: boolean;
  className?: string;
}

const AddressDisplay: React.FC<AddressDisplayProps> = ({
                                                         value,
                                                         length = 8,
                                                         mdLength = 17,
                                                         small = false,
                                                         className = ""
                                                       }) => {
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveAddress = async () => {
      try {
        setLoading(true);
        const resolvedName = await resolveName(value);
        setName(resolvedName);
      } catch (error) {
        console.error('AddressDisplay error resolving:', error);
        setName(null);
      } finally {
        setLoading(false);
      }
    };

    if (value) {
      resolveAddress();
    }
  }, [value]);

  // Show loading state briefly
  if (loading) {
    return (
      <span className={`font-mono ${small ? "text-xs" : "text-sm"} ${className} text-muted-foreground`}>
                <span className="md:hidden">{truncateString(value, length)}</span>
                <span
                  className="hidden md:inline break-words whitespace-pre-wrap">{truncateString(value, mdLength)}</span>
            </span>
    );
  }

  const displayValue = name ?? value;
  const displayText = truncateString(displayValue, length);
  const displayTextMd = truncateString(displayValue, mdLength);

  return (
    <span className={`font-mono ${small ? "text-xs" : "text-sm"} ${className}`}>
            <span className="md:hidden">{displayText}</span>
            <span className="hidden md:inline break-words whitespace-pre-wrap">{displayTextMd}</span>
        </span>
  );
};

export default AddressDisplay;
