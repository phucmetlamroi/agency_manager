'use client'

import React, { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

// Mock initial data based on the epic design. 
// True implementation would fetch from a Server Action calling `prisma.session.groupBy`.
const data = [
  { time: '08:00', sessions: 12 },
  { time: '09:00', sessions: 25 },
  { time: '10:00', sessions: 45 },
  { time: '11:00', sessions: 80 },
  { time: '12:00', sessions: 65 },
  { time: '13:00', sessions: 50 },
  { time: '14:00', sessions: 90 },
  { time: '15:00', sessions: 70 },
  { time: '16:00', sessions: 55 },
  { time: '17:00', sessions: 35 },
  { time: '18:00', sessions: 15 },
]

export default function VisitorLineChart() {
    return (
        <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={data}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                        dataKey="time" 
                        stroke="#52525b" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis 
                        stroke="#52525b" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                    />
                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: '#18181b', 
                            border: '1px solid #3f3f46', 
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                        }}
                        itemStyle={{ color: '#e4e4e7' }}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="sessions" 
                        stroke="#8b5cf6" // Violet accent
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#6366f1', strokeWidth: 0 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
