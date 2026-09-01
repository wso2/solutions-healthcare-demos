// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { type ComponentProps, createContext, type HTMLAttributes, useContext } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";

export type ChoiceboxProps = ComponentProps<typeof RadioGroup>;

export const Choicebox = ({ className, ...props }: ChoiceboxProps) => (
  <RadioGroup className={cn("w-full", className)} {...props} />
);

type ChoiceboxItemContextValue = {
  value: ChoiceboxItemProps["value"];
  id?: ChoiceboxItemProps["id"];
};

const ChoiceboxItemContext = createContext<ChoiceboxItemContextValue | null>(null);

const useChoiceboxItemContext = () => {
  const context = useContext(ChoiceboxItemContext);

  if (!context) {
    throw new Error("useChoiceboxItemContext must be used within a ChoiceboxItem");
  }

  return context;
};

export type ChoiceboxItemProps = ComponentProps<typeof RadioGroupItem>;

export const ChoiceboxItem = ({ className, children, value, id }: ChoiceboxItemProps) => (
  <ChoiceboxItemContext.Provider value={{ value, id }}>
    <FieldLabel htmlFor={id}>
      <Field className={className} orientation="horizontal">
        {children}
      </Field>
    </FieldLabel>
  </ChoiceboxItemContext.Provider>
);

export type ChoiceboxItemHeaderProps = ComponentProps<typeof FieldContent>;

export const ChoiceboxItemHeader = ({ className, ...props }: ChoiceboxItemHeaderProps) => (
  <FieldContent className={className} {...props} />
);

export type ChoiceboxItemTitleProps = ComponentProps<typeof FieldTitle>;

export const ChoiceboxItemTitle = ({ className, ...props }: ChoiceboxItemTitleProps) => (
  <FieldTitle className={className} {...props} />
);

export type ChoiceboxItemSubtitleProps = HTMLAttributes<HTMLSpanElement>;

export const ChoiceboxItemSubtitle = ({ className, ...props }: ChoiceboxItemSubtitleProps) => (
  <span className={cn("font-normal text-muted-foreground text-xs", className)} {...props} />
);

export type ChoiceboxItemDescriptionProps = ComponentProps<typeof FieldDescription>;

export const ChoiceboxItemDescription = ({
  className,
  ...props
}: ChoiceboxItemDescriptionProps) => <FieldDescription className={className} {...props} />;

export type ChoiceboxIndicatorProps = Partial<ComponentProps<typeof RadioGroupItem>>;

export const ChoiceboxIndicator = (props: ChoiceboxIndicatorProps) => {
  const context = useChoiceboxItemContext();

  return <RadioGroupItem {...props} value={context.value} />;
};
