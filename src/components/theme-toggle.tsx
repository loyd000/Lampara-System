import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";

interface ThemeToggleProps {
    className?: string;
    variant?: "ghost" | "outline" | "secondary";
    size?: "icon-sm" | "icon" | "icon-lg" | "sm";
    align?: "start" | "center" | "end";
}

export function ThemeToggle({
    className,
    variant = "ghost",
    size = "icon-sm",
    align = "end",
}: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={variant}
                    size={size}
                    className={cn(
                        "relative text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:ring-1",
                        className,
                    )}
                    aria-label="Toggle theme"
                >
                    <Sun className="size-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute size-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="min-w-[130px] border-border bg-popover">
                <DropdownMenuItem
                    onClick={() => setTheme("light")}
                    className="flex items-center justify-between gap-2 cursor-pointer text-xs"
                >
                    <div className="flex items-center gap-2">
                        <Sun className="size-3.5 text-muted-foreground" />
                        <span>Light</span>
                    </div>
                    {theme === "light" && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setTheme("dark")}
                    className="flex items-center justify-between gap-2 cursor-pointer text-xs"
                >
                    <div className="flex items-center gap-2">
                        <Moon className="size-3.5 text-muted-foreground" />
                        <span>Dark</span>
                    </div>
                    {theme === "dark" && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setTheme("system")}
                    className="flex items-center justify-between gap-2 cursor-pointer text-xs"
                >
                    <div className="flex items-center gap-2">
                        <Monitor className="size-3.5 text-muted-foreground" />
                        <span>System</span>
                    </div>
                    {theme === "system" && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * Direct 1-click Light/Dark toggle button without dropdown.
 */
export function DirectThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme, resolvedTheme } = useTheme();

    const toggleTheme = () => {
        const next = (resolvedTheme || theme) === "dark" ? "light" : "dark";
        setTheme(next);
    };

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            className={cn("relative text-muted-foreground hover:text-foreground hover:bg-accent", className)}
            title={`Switch to ${(resolvedTheme || theme) === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
        >
            <Sun className="size-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </Button>
    );
}
