#include<iostream>
#include<algorithm>
using namespace std;

bool is_prime(int x){
    for (int i = 2; i * i <= x; i++){
        if (x % i == 0) return false;
    }
    return true;
}

int a, b; 

void get_d1(){
    for (int x = 1; x <= 9; x++){
        if (x < a) continue;
        else if (x > b) break;
        if (is_prime (x)) cout << x << endl;
    }
}

void get_d2(){
    for (int d1 = 1; d1 <= 9; d1++){
            int x = d1* 10 + d1;
            if (x < a) continue;
            else if (x > b) break;
            if (is_prime (x)) cout << x << endl;
    }
}

void get_d3(){
    for (int d1 = 1; d1 <= 9; d1++){
        for (int d2 = 0; d2 <= 9; d2++){
                int x = d1* 100 + d2 * 10 + d1;
                if (x < a) continue;
                else if (x > b) break;
                if (is_prime (x)) cout << x << endl;
        }
    }
}

void get_d4(){
    for (int d1 = 1; d1 <= 9; d1++){
        for (int d2 = 0; d2 <= 9; d2++){
                    int x = d1* 1000 + d2 * 100 + d2 * 10 + d1;
                    if (x < a) continue;
                    else if (x > b) break;
                    if (is_prime (x)) cout << x << endl;
                }
            }
}

void get_d5(){
    for (int d1 = 1; d1 <= 9; d1++){
        for (int d2 = 0; d2 <= 9; d2++){
            for (int d3 = 0; d3 <= 9; d3++){
                        int x = d1* 10000 + d2 * 1000 + d3*100 + d2 * 10 + d1;
                        if (x < a) continue;
                        else if (x > b) break;
                        if (is_prime (x)) cout << x << endl;
                    }
                }
            }
}

void get_d6(){
    for (int d1 = 1; d1 <= 9; d1++){
        for (int d2 = 0; d2 <= 9; d2++){
            for (int d3 = 0; d3 <= 9; d3++){
                        int x = d1* 100000 + d2 * 10000 + d3*1000 + d3 * 100 + d2 * 10 + d1;
                        if (x < a) continue;
                        else if (x > b) break;
                        if (is_prime (x)) cout << x << endl;
                    }
                }
            }
}

void get_d7(){
    for (int d1 = 1; d1 <= 9; d1++){
        for (int d2 = 0; d2 <= 9; d2++){
            for (int d3 = 0; d3 <= 9; d3++){
                for (int d4 = 0; d4 <= 9; d4++){
                        int x = d1* 1000000 + d2 * 100000 + d3*10000 + d4 * 1000 + d3 *100 + d2*10 + d1;
                        if (x < a) continue;
                        else if (x > b) break;
                        if (is_prime (x)) cout << x << endl;
                    }
                }
            }
        }
}

void get_d8(){
    for (int d1 = 1; d1 <= 9; d1++){
        for (int d2 = 0; d2 <= 9; d2++){
            for (int d3 = 0; d3 <= 9; d3++){
                for (int d4 = 0; d4 <= 9; d4++){
                        int x = d1* 10000000 + d2 * 1000000 + d3*100000 + d4 * 10000  + d4 * 1000 + d3 * 100 + d2*10+ d1;
                        if (x < a) continue;
                        else if (x > b) break;
                        if (is_prime (x)) cout << x << endl;
                    }
                }
            }
        }
}

int main(){
    cin >> a >> b;
    get_d1(); get_d2(); get_d3();
    get_d4(); get_d5(); get_d6();
    get_d7(); get_d8();
}

// 下面是优化算法版本

#include<iostream>
#include<cmath>
bool is_prime(int x){
    for(int i=2;i*i<=x;i++){
        if(x % i == 0)
            return false;
    }
    return true;
}
bool is_palindrome(int x){
    int temp=x,res=0;
    while (temp)
    {
        res = res*10 + temp%10;
        temp /= 10;
    }
    return x == res;
}
int main(){
    int a,b;
    scanf("%d%d",&a,&b);
    for(int i=a;i<=b;i++){
        if((i&1) && is_palindrome(i) && is_prime(i)){
            printf("%d\n",i);
        }
    }
    return 0;
}