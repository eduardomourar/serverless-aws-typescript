import { Messenger } from './messenger';

describe('Messenger', () => {
    let instance: Messenger;

    beforeEach(() => {
        instance = new Messenger();
    });

    it('should be a valid email', async () => {
        expect(instance).toBeInstanceOf(Messenger);
        const validateEmail = await Messenger.validateEmail('sample@gmail.com');
        expect(validateEmail).toBeTruthy();
    });

    it('should be an invalid email', async () => {
      expect(instance).toBeInstanceOf(Messenger);
      const validateEmail = await Messenger.validateEmail('sample');
      expect(validateEmail).toBeFalsy();
    });

    it('should be a valid phone', async () => {
      expect(instance).toBeInstanceOf(Messenger);
      const validateEmail = await Messenger.validatePhone('+31611111111');
      expect(validateEmail).toBeTruthy();
    });

    it('should be an invalid phone', async () => {
      expect(instance).toBeInstanceOf(Messenger);
      const validateEmail = await Messenger.validatePhone('316');
      expect(validateEmail).toBeFalsy();
    });
});
