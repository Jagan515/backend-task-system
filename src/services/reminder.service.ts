import {
  injectable,
  BindingScope,
  lifeCycleObserver,
  LifeCycleObserver,
} from '@loopback/core';
import Queue from 'bull';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {repository} from '@loopback/repository';
import {
  TaskRepository,
  UserRepository,
  TaskAssignmentRepository,
} from '../repositories';
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
    @repository(TaskAssignmentRepository)
    public taskAssignmentRepository: TaskAssignmentRepository,
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
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async start() {
    this.reminderQueue
      .process(async job => {
        await this.processReminder(job);
      })
      .catch(err => {
        console.error('Redis Queue process error', err);
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
    const task = await this.taskRepository.findById(taskId);

    if (!task || task.status === 'COMPLETED') {
      return;
    }

    const assignments = await this.taskAssignmentRepository.find({
      where: {taskId},
    });
    const assigneeIds = assignments.map(a => a.userId);
    const assignees = await this.userRepository.find({
      where: {id: {inq: assigneeIds}},
    });

    for (const user of assignees) {
      if (user.email && user.isActive !== false) {
        try {
          await this.transporter.sendMail({
            from: '"Task Management System" <no-reply@tasksystem.com>',
            to: user.email,
            subject: `Reminder: ${task.title}`,
            text: `Hi ${user.firstName || 'there'},\n\nJust a reminder for your task: ${task.title}\n\nDue Date: ${new Date(task.dueDate).toLocaleString()}\n\nDescription: ${task.description || 'No description provided.'}\n\nBest,\nTask Team`,
          });
          console.log(`Reminder email sent to: ${user.email} for task: ${task.title}`);
        } catch (error) {
          console.error(`Failed to send email to ${user.email}:`, error);
        }
      }
    }
  }

  async sendWelcomeEmail(user: {email: string; firstName?: string; password?: string}) {
    try {
      await this.transporter.sendMail({
        from: '"Task Management System" <admin@tasksystem.com>',
        to: user.email,
        subject: 'Welcome to Task Management System',
        html: `
          <h3>Welcome ${user.firstName || 'User'}!</h3>
          <p>Your account has been created successfully.</p>
          <p><strong>Your Credentials:</strong></p>
          <ul>
            <li><strong>Email:</strong> ${user.email}</li>
            <li><strong>Password:</strong> ${user.password}</li>
          </ul>
          <p><em>Note: You will be required to change your password upon your first login.</em></p>
          <br/>
          <p>Best regards,<br/>The Task Management Team</p>
        `,
      });
      console.log(`Welcome email sent to: ${user.email}`);
    } catch (error) {
      console.error(`Failed to send welcome email to ${user.email}:`, error);
    }
  }

  async stop() {
    await this.reminderQueue.close();
  }
}
