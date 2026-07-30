#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        cin>>n;
        if(n==1)
        {
            cout<<1<<endl;continue;
        }
        if(n==2)
        {
            cout<<-1<<endl;continue;
        }
        cout<<"1 2 3";
        long long sum=6;
        for(int i=4;i<=n;i++)
        {
            cout<<" "<<sum;
            sum*=2;
        }
        cout<<endl;
    }
    return 0;
}