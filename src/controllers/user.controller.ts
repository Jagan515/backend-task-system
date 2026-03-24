import {inject} from '@loopback/core';
import {repository, Filter} from '@loopback/repository';
import {
  post,
  get,
  patch,
  del,
  param,
  requestBody,
  response,
  HttpErrors,
  patch,
  del,
} from '@loopback/rest';
import {TokenServiceBindings} from '@loopback/authentication-jwt';
import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {TokenService} from '@loopback/authentication';
import {User} from '../models';
import {UserRole, PERMISSIONS} from '../config/permissions';
import {UserRepository} from '../repositories';
import * as bcrypt from 'bcryptjs';
import {securityId, UserProfile, SecurityBindings} from '@loopback/security';
import {AuditService, ReminderService} from '../services';

export class UserController {
  constructor(
    @repository(UserRepository)
    public userRepository: UserRepository,
    @inject(TokenServiceBindings.TOKEN_SERVICE)
    public jwtService: TokenService,
    @inject('services.AuditService')
    public auditService: AuditService,
    @inject('services.ReminderService')
    public reminderService: ReminderService,
    @inject(SecurityBindings.USER, {optional: true})
    public user: UserProfile,
  ) {}

  private generateRandomUsername(): string {
    const adjectives = ['Swift', 'Brave', 'Quiet', 'Valiant', 'Agile', 'Bright', 'Golden', 'Misty'];
    const animals = ['Fox', 'Eagle', 'Wolf', 'Panther', 'Lion', 'Hawk', 'Dolphin', 'Tiger'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const anim = animals[Math.floor(Math.random() * animals.length)];
    const num = Math.floor(10 + Math.random() * 900);
    return `${adj}${anim}-${num}`;
  }

  @authenticate('jwt')
  @authorize({allowedRoles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.USER]})
  @get('/users')
  @response(200, {
    description: 'Array of User model instances',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': User}},
      },
    },
  })
  async find(@param.filter(User) filter?: Filter<User>): Promise<User[]> {
    const userRole = this.user.role;
    const userId = parseInt(this.user[securityId]);
    
    let combinedFilter = filter ?? {};
    const where = combinedFilter.where ?? {};

    if (userRole === UserRole.ADMIN) {
      // Admin can see everything
      combinedFilter = {
        ...combinedFilter,
        where: { ...where }
      };
    } else if (userRole === UserRole.MANAGER) {
      // Managers see only users they created
      combinedFilter = {
        ...combinedFilter,
        where: {
          ...where,
          createdBy: userId
        }
      };
    } else if (userRole === UserRole.USER) {
      // Users can see their fellow team members (same creator)
      const currentUser = await this.userRepository.findById(userId);
      if (currentUser.createdBy) {
        combinedFilter = {
          ...combinedFilter,
          where: {
            ...where,
            createdBy: currentUser.createdBy
          }
        };
      } else {
        // Orphaned users see nobody
        return [];
      }
    }

    const users = await this.userRepository.find(combinedFilter);
    return users.map(u => {
      const userWithoutPassword = u;
      delete (userWithoutPassword as Partial<User>).password;
      return userWithoutPassword as User;
    });
  }

  @authenticate('jwt')
  @authorize({allowedRoles: PERMISSIONS.MANAGE_USERS})
  @post('/users')
  @response(200, {
    description: 'User created by Admin',
    content: {'application/json': {schema: {'x-ts-type': User}}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password', 'role'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
              firstName: {type: 'string'},
              lastName: {type: 'string'},
              role: {type: 'string', enum: Object.values(UserRole)},
              isActive: {type: 'boolean'},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: {email: userData.email},
    });

    if (existingUser) {
      throw new HttpErrors.BadRequest('A user with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(userData.password!, 10);
    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword,
    });

    // @ts-expect-error: password is removed before returning user
    delete user.password;
    return user;
  }

  @authenticate('jwt')
  @authorize({allowedRoles: PERMISSIONS.MANAGE_USERS})
  @patch('/users/{id}')
  @response(204, {description: 'User update success'})
  async updateById(
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              firstName: {type: 'string'},
              lastName: {type: 'string'},
              role: {type: 'string', enum: Object.values(UserRole)},
              isActive: {type: 'boolean'},
              password: {type: 'string'},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<void> {
    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }
    await this.userRepository.updateById(id, userData);
  }

  @authenticate('jwt')
  @authorize({allowedRoles: PERMISSIONS.MANAGE_USERS})
  @del('/users/{id}')
  @response(204, {description: 'User DELETE success'})
  async deleteById(@param.path.number('id') id: number): Promise<void> {
    await this.userRepository.deleteById(id);
  }

  @post('/signup')
  @response(200, {
    description: 'User signup',
    content: {'application/json': {schema: {'x-ts-type': User}}},
  })
  async signup(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
              firstName: {type: 'string'},
              lastName: {type: 'string'},

              role: {type: 'string', enum: ['USER', 'MANAGER', 'ADMIN']},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<User> {
    try {
      const existingUser = await this.userRepository.findOne({
        where: {email: userData.email},
      });

      if (existingUser) {
        throw new HttpErrors.BadRequest('A user with this email already exists.');
      }

      if (!userData.password || userData.password.length < 6) {
        throw new HttpErrors.BadRequest(
          'Password must be at least 6 characters.',
        );
      }


    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword,
      role: UserRole.CONSUMER, // Force default role
      isActive: true,
    });


      // Clean: Use spread and delete to avoid direct mutation of the created user object if needed, 
      // but LB4 creates are fresh objects. Still, cleaner to handle it explicitly.
      const result: Partial<User> = {...user};
      delete result.password;
      return result as User;
    } catch (err) {
      console.error('Signup Error:', err);
      throw err;
    }
  }

  @post('/login')
  @response(200, {
    description: 'Token',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            token: {type: 'string'},
          },
        },
      },
    },
  })
  async login(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
            },
          },
        },
      },
    })
    credentials: Partial<User>,
  ): Promise<{token: string}> {
    if (!credentials.email || !credentials.password) {
      throw new HttpErrors.BadRequest('Email and password are required.');
    }

    const user = await this.userRepository.findOne({
      where: {email: credentials.email},
    });

    if (!user) {
      throw new HttpErrors.Unauthorized('Invalid email or password');
    }

    if (user.isActive === false) {

      throw new HttpErrors.Unauthorized(
        'Your account has been deactivated. Please contact an Admin.',
      );

    }

    const passwordMatched = await bcrypt.compare(
      credentials.password,
      user.password,
    );

    if (!passwordMatched) {
      throw new HttpErrors.Unauthorized('Invalid email or password');
    }

    const userProfile: UserProfile = {
      [securityId]: user.id!.toString(),
      name:
        (user.username ?? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()) || user.email,
      email: user.email,
      role: user.role ?? UserRole.USER,
      passwordResetRequired: user.passwordResetRequired,
    };

    const token = await this.jwtService.generateToken(userProfile);
    return {token};
  }

  @authenticate('jwt')
  @get('/users/whoami')
  @response(200, {
    description: 'The current user profile',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            id: {type: 'string'},
            email: {type: 'string'},
            name: {type: 'string'},
            role: {type: 'string'},
          },
        },
      },
    },
  })
  async whoAmI(): Promise<any> {
    const userId = this.user[securityId];
    return {
      id: userId,
      email: this.user.email,
      name: this.user.name,
      role: this.user.role,
    };
  }

  @authenticate('jwt')
  @post('/users/change-password')
  @response(204, {description: 'Password changed successfully'})
  async changePassword(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['newPassword'],
            properties: {
              newPassword: {type: 'string', minLength: 6},
            },
          },
        },
      },
    })
    payload: {newPassword: string},
  ): Promise<void> {
    const userId = this.user[securityId];
    const hashedPassword = await bcrypt.hash(payload.newPassword, 10);
    
    await this.userRepository.updateById(parseInt(userId), {
      password: hashedPassword,
      passwordResetRequired: false, // Reset the flag
    });

    await this.auditService.log('User', parseInt(userId), 'PASSWORD_CHANGE', userId);
  }

  @authenticate('jwt')
  @authorize({allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]})
  @post('/users')
  @response(200, {
    description: 'User model instance',
    content: {'application/json': {schema: {'x-ts-type': User}}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password', 'role'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
              firstName: {type: 'string'},
              lastName: {type: 'string'},
              username: {type: 'string'},
              role: {type: 'string', enum: ['USER', 'MANAGER', 'ADMIN']},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<User> {
    try {
      const userRole = this.user.role;
      const userId = parseInt(this.user[securityId]);
      
      // Logic: Managers can only create users with USER role
      if (userRole === UserRole.MANAGER && userData.role !== UserRole.USER) {
        throw new HttpErrors.Forbidden('Managers can only create users with the "USER" role.');
      }

      const existingUser = await this.userRepository.findOne({
        where: {email: userData.email},
      });

      if (existingUser) {
        throw new HttpErrors.BadRequest('A user with this email already exists.');
      }

      const hashedPassword = await bcrypt.hash(userData.password!, 10);
      const user = await this.userRepository.create({
        ...userData,
        password: hashedPassword,
        passwordResetRequired: true, // Force reset on first login
        username: this.generateRandomUsername(),
        createdBy: userId,
      });

      // Send welcome email with credentials
      await this.reminderService.sendWelcomeEmail({
        email: user.email,
        firstName: user.firstName,
        password: userData.password,
      });

      const result: Partial<User> = {...user};
      delete result.password;
      return result as User;
    } catch (err) {
      console.error('Create User Error:', err);
      if (err.details) {
        console.error('Validation details:', JSON.stringify(err.details, null, 2));
      }
      throw err;
    }
  }

  @authenticate('jwt')
  @authorize({allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]})
  @patch('/users/{id}')
  @response(204, {description: 'User PATCH success'})
  async updateById(
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              email: {type: 'string'},
              firstName: {type: 'string'},
              lastName: {type: 'string'},
              role: {type: 'string', enum: ['USER', 'MANAGER', 'ADMIN']},
              isActive: {type: 'boolean'},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<void> {
    const userRole = this.user.role;
    const currentUserId = parseInt(this.user[securityId]);
    const targetUser = await this.userRepository.findById(id);

    // Self-Protection: Users cannot deactivate their own account or change their own role
    if (id === currentUserId) {
      if (userData.role && userData.role !== targetUser.role) {
        throw new HttpErrors.Forbidden('You cannot change your own role.');
      }
      if (userData.isActive !== undefined && userData.isActive !== targetUser.isActive) {
        throw new HttpErrors.Forbidden('You cannot deactivate your own account.');
      }
    } else {
      // Hierarchy Check
      if (userRole === UserRole.MANAGER) {
        // Manager can only update users they created
        if (targetUser.createdBy !== currentUserId) {
          throw new HttpErrors.Forbidden('Managers can only manage users they created.');
        }
        // Manager cannot promote to MANAGER or ADMIN
        if (userData.role && userData.role !== UserRole.USER) {
          throw new HttpErrors.Forbidden('Managers can only assign the USER role.');
        }
      } else if (userRole === UserRole.ADMIN) {
        // Admin can manage anyone
      } else {
        throw new HttpErrors.Forbidden('Unauthorized to update users.');
      }
    }

    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }
    await this.userRepository.updateById(id, userData);
  }

  @authenticate('jwt')
  @authorize({allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]})
  @del('/users/{id}')
  @response(204, {description: 'User DELETE success'})
  async deleteById(@param.path.number('id') id: number): Promise<void> {
    const userRole = this.user.role;
    const currentUserId = parseInt(this.user[securityId]);
    const targetUser = await this.userRepository.findById(id);

    // Self-Protection
    if (id === currentUserId) {
      throw new HttpErrors.Forbidden('You cannot delete your own account.');
    }

    // Hierarchy Check
    if (userRole === UserRole.MANAGER) {
      if (targetUser.createdBy !== currentUserId) {
        throw new HttpErrors.Forbidden('Managers can only delete users they created.');
      }
    } else if (userRole === UserRole.ADMIN) {
      // Admin can delete anyone
    } else {
      throw new HttpErrors.Forbidden('Unauthorized to delete users.');
    }

    await this.userRepository.deleteById(id);
  }
}
