// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
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
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/* eslint-disable @typescript-eslint/no-explicit-any */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import 'highlight.js/styles/github.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Check if the entire content is wrapped in a single code block
  const codeBlockRegex = /^```(?:\w+)?\n?([\s\S]*?)\n?```$/
  const match = content.trim().match(codeBlockRegex)
  
  // If the entire content is a code block, extract and render the inner content as markdown
  const actualContent = match ? match[1] : content

  return (
    <div className={`chat-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // Customize code blocks
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const inline = !match
            return !inline ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <code {...props}>
                {children}
              </code>
            )
          },
          // Customize pre blocks (code blocks container)
          pre({ children, ...props }: any) {
            return (
              <pre {...props}>
                {children}
              </pre>
            )
          },
          // Let CSS handle the rest of the styling
        }}
      >
        {actualContent}
      </ReactMarkdown>
    </div>
  )
}
