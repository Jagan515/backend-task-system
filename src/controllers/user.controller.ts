import {inject} from '@loopback/core';
import {
  repository,
} from '@loopback/repository';
import {
  post,
  requestBody,
  response,
  HttpErrors,
} from '@loopback/rest';
import {
  TokenServiceBindings,
  UserServiceBindings,
} from '@loopback/authentication-jwt';
import {TokenService} from '@loopback/authentication';
import {User, UserRole} from '../models';
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
              role: {type: 'string', enum: Object.values(UserRole)},
            },
          },
        },
      },
    })
    userData: Partial<User>,
  ): Promise<User> {
    const password = await bcrypt.hash(userData.password!, 10);
    const user = await this.userRepository.create({
      ...userData,
      password,
    });
    // @ts-ignore
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
    const user = await this.userRepository.findOne({
      where: {email: credentials.email},
    });

    if (!user) {
      throw new HttpErrors.Unauthorized('Invalid email or password');
    }

    const passwordMatched = await bcrypt.compare(
      credentials.password!,
      user.password,
    );

    if (!passwordMatched) {
      throw new HttpErrors.Unauthorized('Invalid email or password');
    }

    const userProfile: UserProfile = {
      [securityId]: user.id!.toString(),
      name: user.email,
      role: user.role,
    };

    const token = await this.jwtService.generateToken(userProfile);
    return {token};
  }
}
