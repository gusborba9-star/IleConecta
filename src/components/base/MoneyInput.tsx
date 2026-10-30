import React from "react";
import { Input } from "@/components/base";
import { applyMoneyEdit } from "@/lib/moneyMask";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** Texto já formatado ("100,00") ou vazio. */
  value: string;
  onValueChange: (masked: string) => void;
};

/** Campo de valor em reais: digita-se só números (10000) e aparece 100,00. */
export default function MoneyInput({ value, onValueChange, ...rest }: Props) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => onValueChange(applyMoneyEdit(value, e.target.value))}
    />
  );
}
