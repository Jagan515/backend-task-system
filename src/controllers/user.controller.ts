import {inject} from '@loopback/core';
import {repository, Filter} from '@loopback/repository';
import {
  post,
  get,
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
import {securityId, UserProfile} from '@loopback/security';

export class UserController {
  constructor(
    @repository(UserRepository)
    public userRepository: UserRepository,
    @inject(TokenServiceBindings.TOKEN_SERVICE)
    public jwtService: TokenService,
  ) {}

  @authenticate('jwt')
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
    const users = await this.userRepository.find(filter);
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
              role: {type: 'string', enum: [UserRole.CONSUMER]}, // Default role only via signup
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

    // @ts-expect-error: password is removed before returning user
    delete user.password;
    return user;
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
        `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      email: user.email,
      role: user.role,
    };

    const token = await this.jwtService.generateToken(userProfile);
    return {token};
  }
}
