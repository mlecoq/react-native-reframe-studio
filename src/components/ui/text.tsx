import { createContext, useContext } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { cn } from './cn';

/**
 * Lets a parent (e.g. Button) style the text it contains without prop
 * drilling — the same pattern react-native-reusables uses.
 */
export const TextClassContext = createContext<string | undefined>(undefined);

export const Text = ({ className, ...props }: TextProps & { className?: string }) => {
  const contextClass = useContext(TextClassContext);
  return (
    <RNText
      className={cn('font-sans text-base text-foreground', contextClass, className)}
      {...props}
    />
  );
};
