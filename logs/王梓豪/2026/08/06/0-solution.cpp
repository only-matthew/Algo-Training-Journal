#include<bits/stdc++.h>
using namespace std;
int main()
{
    int n;
    cin>>n;
    int a,b,c,temp;
    cin>>a>>b>>c;
    for(int i=0;i<n-2;i++)
     cin>>temp>>temp>>temp;
    int cnt=0;
    if(abs(a-b)==1||abs(a-b)==(n-1))
    cnt++;
    if(abs(a-c)==1||abs(a-c)==(n-1))
    cnt++;
    if(abs(b-c)==1||abs(b-c)==(n-1))
    cnt++;
        if (cnt == 2 || (n - 3) % 2 == 1)
        cout<<"JMcat Win"<<endl;
    else
        cout<<"PZ Win"<<endl;
}