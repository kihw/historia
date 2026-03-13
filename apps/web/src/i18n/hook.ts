"use client";

import { useContext } from "react";
import { I18nContext, type I18nContextType } from "./context";

export function useTranslation(): I18nContextType {
  return useContext(I18nContext);
}
