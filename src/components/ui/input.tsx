import { TextInput, type TextInputProps } from 'react-native';
import { cn } from './cn';

export const Input = ({ className, ...props }: TextInputProps & { className?: string }) => (
  <TextInput
    className={cn(
      'min-h-12 rounded-xl border border-border bg-surface-2 px-4 py-3 font-sans text-base text-foreground',
      className
    )}
    placeholderTextColor="#8A94A6"
    {...props}
  />
);
