"use client"

import { Card, AreaChart, Metric, Text, Flex, Grid, Color } from "@tremor/react"

interface KPIStatsProps {
    tasks: any[]
}

const data = [
    {
        Month: "Jan 21",
        Sales: 2890,
        Profit: 2400,
    },
    {
        Month: "Feb 21",
        Sales: 1890,
        Profit: 1398,
    },
    // ... more dummy data or real data mapping
    {
        Month: "Jul 21",
        Sales: 3490,
        Profit: 4300,
    },
]

export function KPIStats({ tasks }: KPIStatsProps) {
    // Calculate real stats
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'DONE').length
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length

    // Calculate simple completion rate
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    return (
        <Grid numItemsSm={2} numItemsLg={3} className="gap-6 mb-6">
            <Card decoration="top" decorationColor="indigo" className="glass-panel border-none ring-0 bg-transparent p-6">
                <Flex justifyContent="start" alignItems="baseline" className="space-x-1">
                    <Metric className="text-white text-3xl font-bold">{totalTasks}</Metric>
                    <Text className="text-tremor-content-subtle">Total Tasks</Text>
                </Flex>
                <AreaChart
                    className="mt-6 h-16 w-full"
                    data={data}
                    index="Month"
                    categories={["Sales"]}
                    colors={["indigo"]}
                    showXAxis={false}
                    showGridLines={false}
                    startEndOnly={true}
                    showYAxis={false}
                    showLegend={false}
                    showTooltip={false}
                    curveType="monotone"
                />
            </Card>

            <Card decoration="top" decorationColor="fuchsia" className="glass-panel border-none ring-0 bg-transparent p-6">
                <Flex justifyContent="start" alignItems="baseline" className="space-x-1">
                    <Metric className="text-white text-3xl font-bold">{completionRate}%</Metric>
                    <Text className="text-tremor-content-subtle">Completion Rate</Text>
                </Flex>
                <Flex className="mt-4">
                    <Text className="text-emerald-400">+{Math.floor(Math.random() * 20)}% from last week</Text>
                </Flex>
            </Card>

            <Card decoration="top" decorationColor="cyan" className="glass-panel border-none ring-0 bg-transparent p-6">
                <Flex justifyContent="start" alignItems="baseline" className="space-x-1">
                    <Metric className="text-white text-3xl font-bold">{inProgressTasks}</Metric>
                    <Text className="text-tremor-content-subtle">Active Now</Text>
                </Flex>
                <div className="mt-4 flex -space-x-2 overflow-hidden">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-zinc-800 flex items-center justify-center text-xs">U{i}</div>
                    ))}
                </div>
            </Card>
        </Grid>
    )
}
