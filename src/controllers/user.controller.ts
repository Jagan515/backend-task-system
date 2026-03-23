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
} from '@loopback/rest';
import {TokenServiceBindings} from '@loopback/authentication-jwt';
import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {TokenService} from '@loopback/authentication';
import {User} from '../models';
import {UserRole} from '../config/permissions';
import {UserRepository} from '../repositories';
import * as bcrypt from 'bcryptjs';
import {securityId, UserProfile, SecurityBindings} from '@loopback/security';
import {AuditService} from '../services';

export class UserController {
  constructor(
    @repository(UserRepository)
    public userRepository: UserRepository,
    @inject(TokenServiceBindings.TOKEN_SERVICE)
    public jwtService: TokenService,
    @inject('services.AuditService')
    public auditService: AuditService,
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
  @authorize({allowedRoles: [UserRole.ADMIN, UserRole.MANAGER]})
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
    
    let combinedFilter = filter ?? {};
    if (userRole === UserRole.MANAGER) {
      combinedFilter = {
        ...combinedFilter,
        where: {
          ...combinedFilter.where,
          role: UserRole.USER,
          isActive: {neq: false}
        }
      };
    } else {
      combinedFilter = {
        ...combinedFilter,
        where: {
          ...combinedFilter.where,
          isActive: {neq: false}
        }
      };
    }

    const users = await this.userRepository.find(combinedFilter);
    return users.map(u => {
      const userWithoutPassword = u;
      delete (userWithoutPassword as Partial<User>).password;
      return userWithoutPassword as User;
    });
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
              role: {type: 'string', enum: Object.values(UserRole)},
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
        role: UserRole.ADMIN, // Force 'admin' role for public signups
        username: this.generateRandomUsername(),
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
      throw new HttpErrors.Unauthorized('Your account is deactivated. Please contact the administrator.');
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
        user.username || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      email: user.email,
      role: user.role,
      passwordResetRequired: user.passwordResetRequired,
    };

    const token = await this.jwtService.generateToken(userProfile);
    return {token};
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
              role: {type: 'string', enum: Object.values(UserRole)},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<User> {
    const userRole = this.user.role;
    
    // Logic: Managers can only create 'user' role
    if (userRole === UserRole.MANAGER && userData.role !== UserRole.USER) {
      throw new HttpErrors.Forbidden('Managers can only create users with the "user" role.');
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
    });

    const result: Partial<User> = {...user};
    delete result.password;
    return result as User;
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
              role: {type: 'string', enum: Object.values(UserRole)},
              isActive: {type: 'boolean'},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<void> {
    const userRole = this.user.role;
    const targetUser = await this.userRepository.findById(id);

    // Logic: Managers can only update 'user' role users
    if (userRole === UserRole.MANAGER) {
      if (targetUser.role !== UserRole.USER) {
        throw new HttpErrors.Forbidden('Managers can only manage users with the "user" role.');
      }
      if (userData.role && userData.role !== UserRole.USER) {
        throw new HttpErrors.Forbidden('Managers cannot promote users to Manager or Admin.');
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
    const targetUser = await this.userRepository.findById(id);

    // Logic: Managers can only delete 'user' role users
    if (userRole === UserRole.MANAGER && targetUser.role !== UserRole.USER) {
      throw new HttpErrors.Forbidden('Managers can only delete users with the "user" role.');
    }

    await this.userRepository.deleteById(id);
  }
}
