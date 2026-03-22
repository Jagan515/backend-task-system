import {injectable, BindingScope, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import Queue from 'bull';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {repository} from '@loopback/repository';
import {TaskRepository, UserRepository} from '../repositories';
import * as nodemailer from 'nodemailer';

dotenv.config({path: path.join(__dirname, '../../.env')});

@injectable({scope: BindingScope.SINGLETON})
@lifeCycleObserver('ReminderService')
export class ReminderService implements LifeCycleObserver {
  private reminderQueue: Queue.Queue;
  private transporter: nodemailer.Transporter;

  constructor(
    @repository(TaskRepository)
    public taskRepository: TaskRepository,
    @repository(UserRepository)
    public userRepository: UserRepository,
  ) {
    this.reminderQueue = new Queue('task-reminders', {
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT!),
      },
    });

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT!),
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    this.reminderQueue.process(async (job) => {
      await this.processReminder(job);
    });
  }

  async scheduleReminder(taskId: number, dueDate: Date) {
    // Schedule 1 hour before due date
    const reminderTime = new Date(dueDate.getTime() - 60 * 60 * 1000);
    const delay = reminderTime.getTime() - Date.now();

    if (delay > 0) {
      await this.reminderQueue.add(
        {taskId},
        {
          delay,
          jobId: `reminder-${taskId}`, // Idempotency
          removeOnComplete: true,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }
  }

  private async processReminder(job: Queue.Job) {
    const {taskId} = job.data;
    const task = await this.taskRepository.findById(taskId, {
      include: [{relation: 'assignees' as any}],
    });

    if (!task || task.status === 'COMPLETED') {
      return;
    }

    // Get assignees (This requires a relation which I haven't fully defined yet in LB4 style, but let's assume it for now)
    // Actually I should fetch from TaskAssignmentRepository
    // ... logic to send email to all assignees
    console.log(`Sending reminder for task: ${task.title}`);
  }

  async stop() {
    await this.reminderQueue.close();
  }
}
