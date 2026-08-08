import { cva, type VariantProps } from 'class-variance-authority';
import { Pressable, type PressableProps } from 'react-native';
import { cn } from './cn';
import { TextClassContext } from './text';

const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-2xl',
  {
    variants: {
      variant: {
        default: 'bg-accent active:opacity-80',
        secondary: 'bg-surface-2 border border-border active:opacity-80',
        ghost: 'active:bg-surface-2',
        destructive: 'bg-danger/10 active:opacity-80',
      },
      size: {
        default: 'h-12 px-5',
        sm: 'h-9 px-3 rounded-xl',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const buttonTextVariants = cva('font-sans', {
  variants: {
    variant: {
      default: 'text-accent-foreground',
      secondary: 'text-foreground',
      ghost: 'text-foreground',
      destructive: 'text-danger',
    },
    size: { default: 'text-base', sm: 'text-sm', icon: 'text-base' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & { className?: string };

export const Button = ({ className, variant, size, ...props }: ButtonProps) => (
  <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
    <Pressable
      className={cn(buttonVariants({ variant, size }), props.disabled && 'opacity-40', className)}
      {...props}
    />
  </TextClassContext.Provider>
);
