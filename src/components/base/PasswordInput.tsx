import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/base";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/** Campo de senha com botão para mostrar ou ocultar o que foi digitado. */
export default function PasswordInput({ className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...rest} type={visible ? "text" : "password"} className={`pr-11 ${className ?? ""}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
