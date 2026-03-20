import React, {useEffect, useState} from "react";
import {resolveName} from "@/lib/cryptoNameHelpers.ts";
import CopyableField from "@/components/CopyableField.tsx";

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
      <CopyableField
        value={value}
        small={small}
        length={length}
        mdLength={mdLength}
        className={`${className} text-muted-foreground`.trim()}
      />
    );
  }

  return (
    <CopyableField
      value={value}
      displayValue={name ?? value}
      small={small}
      length={length}
      mdLength={mdLength}
      className={className}
    />
  );
};

export default AddressDisplay;
