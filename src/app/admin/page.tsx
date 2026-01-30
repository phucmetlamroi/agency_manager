import { prisma } from '@/lib/db'
import { createTask } from '@/actions/admin-actions'
import { deleteTask } from '@/actions/task-management-actions'
import { revalidatePath } from 'next/cache'
import TaskTable from '@/components/TaskTable'
import CreateTaskForm from '@/components/CreateTaskForm'
import { isMobileDevice } from '@/lib/device'
import BottleneckAlert from '@/components/BottleneckAlert'

// ... existing imports

{/* Task Lists */ }
<div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

    {/* Bottleneck Alert */}
    <BottleneckAlert tasks={tasks as any} />

    {/* ACTIVE TASKS */}
    <div>
        <h3 style={{ marginBottom: '1rem', color: '#ccc' }}>🔥 Đang Thực Hiện ({assignedTasks.length})</h3>
        <TaskTable tasks={assignedTasks as any} isAdmin={true} users={users} isMobile={await isMobileDevice()} />
    </div>
</div>

        </div >
    )
}
